import Stripe from 'stripe';
import { StripeDrizzleAdapter, SqlFlavorOptions, DefaultSchema } from './drizzleAdapter/stripeDrizzleAdapter';

// Using stripe pre-built payment page


type StripePriceId = `price_${string}`;

interface SeatPricing {
  stripePriceId: StripePriceId;
  plan: string;
}

interface UsagePricing {
  stripePriceId: StripePriceId;
  usage: string;
}

interface FeaturePricing {
  stripePriceId: StripePriceId;
  feature: string;
}


interface PricingStructure {
  seats: SeatPricing[];
  usages: UsagePricing[];
  features: FeaturePricing[];
}

interface StripeBillingManagerConfig<SqlFlavor extends SqlFlavorOptions, TPricingStructure extends PricingStructure> {
  apiKey: string;
  pricingStructure: TPricingStructure;
  db: SqlFlavor,
  schema: DefaultSchema<SqlFlavor, any, any, any>
}


class SeatBasedOperations<TManager extends StripeBillingManager<SqlFlavorOptions, PricingStructure>> {
  constructor(
    private manager: TManager,
  ) { }


  /**
   * Update the seat count for a subscription. This will create a proration if the seat count is increased, and will not create a proration if the seat count is decreased.
   * @param subscriptionId - The ID of the subscription.
   * @param plan - The ID of the price to update.
   * @param newCount - The new seat count.
   */
  async updateSeatCount(subscriptionId: string, plan: TManager['_pricingSeats'] | StripePriceId, newCount: number): Promise<Stripe.Subscription> {

    const priceId = this.manager.getStripePriceIdByPlan(plan);

    const subscription = await this.manager.stripe.subscriptions.retrieve(subscriptionId, { expand: ['items'] });
    const item = subscription.items.data.find(item => item.price.id === priceId);

    if (!item) {
      throw new Error(`Item not found for priceId: ${plan}/${priceId}`);
    }

    const quantity = item.quantity ?? 0;
    const isIncrease = newCount > quantity;

    return this.manager.stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, quantity: newCount }],
      proration_behavior: isIncrease ? 'always_invoice' : 'none',
    });
  }

  async changeSeatPrice(subscriptionId: string, plan: TManager['_pricingSeats'] | StripePriceId, newPlan: TManager['_pricingSeats'] | StripePriceId, isUpgrade: boolean): Promise<Stripe.Subscription> {

    const priceId = this.manager.getStripePriceIdByPlan(plan);
    const newPriceId = this.manager.getStripePriceIdByPlan(newPlan);

    const subscription = await this.manager.stripe.subscriptions.retrieve(subscriptionId, { expand: ['items'] });
    const item = subscription.items.data.find(item => item.price.id === priceId);

    if (!item) {
      throw new Error(`Item not found for priceId: ${plan}/${priceId}`);
    }

    const quantity = item.quantity ?? 0;

    return this.manager.stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, deleted: true }, { price: newPriceId, quantity }],
      proration_behavior: isUpgrade ? 'always_invoice' : 'none',
      billing_cycle_anchor: isUpgrade ? 'now' : 'unchanged',
    });
  }
}

class UsageBasedOperations<TManager extends StripeBillingManager<SqlFlavorOptions, PricingStructure>> {
  constructor(
    private manager: TManager,
  ) { }

  async reportUsage(usage: TManager['_pricingUsages'] | StripePriceId, quantity: number) {

    const priceId = this.manager.getStripePriceIdByUsage(usage);

    return this.manager.stripe.subscriptionItems.createUsageRecord(priceId, {
      quantity,
      timestamp: 'now',
      action: 'increment',
    });
  }
}

class FeatureBasedOperations<TManager extends StripeBillingManager<SqlFlavorOptions, PricingStructure>> {
  constructor(
    private manager: TManager,
  ) { }

  async addFeature(subscriptionId: string, feature: TManager['_pricingFeatures'] | StripePriceId) {
    const priceId = this.manager.getStripePriceIdByFeature(feature);
    return this.manager.stripe.subscriptions.update(subscriptionId, {
      items: [{ price: priceId }],
    });
  }

  async removeFeature(subscriptionId: string, feature: TManager['_pricingFeatures'] | StripePriceId) {
    const priceId = this.manager.getStripePriceIdByFeature(feature);
    return this.manager.stripe.subscriptions.update(subscriptionId, {
      items: [{ price: priceId, deleted: true }],
      proration_behavior: 'none',
    });
  }
}

export class StripeBillingManager<SqlFlavor extends SqlFlavorOptions, TPricingStructure extends PricingStructure> {
  public stripe: Stripe;
  public seat: SeatBasedOperations<this>;
  public usage: UsageBasedOperations<this>;
  public feature: FeatureBasedOperations<this>;
  private adapter: ReturnType<typeof StripeDrizzleAdapter>;
  private pricingStructure: TPricingStructure;

  public _pricingSeats!: TPricingStructure['seats'][number]['plan'];
  public _pricingUsages!: TPricingStructure['usages'][number]['usage'];
  public _pricingFeatures!: TPricingStructure['features'][number]['feature'];

  constructor(
    config: StripeBillingManagerConfig<SqlFlavor, TPricingStructure>,
  ) {
    this.stripe = new Stripe(config.apiKey, { apiVersion: '2024-09-30.acacia' });
    this.adapter = StripeDrizzleAdapter(config.db, config.schema);
    this.seat = new SeatBasedOperations(this);
    this.usage = new UsageBasedOperations(this);
    this.feature = new FeatureBasedOperations(this);
    this.pricingStructure = config.pricingStructure;
  }

  getStripePriceIdByPlan(plan: TPricingStructure['seats'][number]['plan']) {
    if (plan.startsWith('price_')) return plan;
    const priceId = this.pricingStructure.seats.find(item => item.plan === plan)?.stripePriceId;
    if (!priceId) throw new Error(`Invalid plan label: ${plan}`);
    return priceId;
  }

  getStripePriceIdByUsage(usage: TPricingStructure['usages'][number]['usage']) {
    if (usage.startsWith('price_')) return usage;
    const priceId = this.pricingStructure.usages.find(item => item.usage === usage)?.stripePriceId;
    if (!priceId) throw new Error(`Invalid usage label: ${usage}`);
    return priceId;
  }

  getStripePriceIdByFeature(feature: TPricingStructure['features'][number]['feature']) {
    if (feature.startsWith('price_')) return feature;
    const priceId = this.pricingStructure.features.find(item => item.feature === feature)?.stripePriceId;
    if (!priceId) throw new Error(`Invalid feature label: ${feature}`);
    return priceId;
  }

  async createSubscription(customerId: string, planLabel: string): Promise<Stripe.Subscription> {
    const priceId = this.getStripePriceIdByPlan(planLabel);
    if (!priceId) {
      throw new Error(`Invalid plan label: ${planLabel}`);
    }
    return this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
    });
  }

  async createBillingPortalSession(customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async createCheckoutSession(params: Stripe.Checkout.SessionCreateParams): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create(params);
  }
}
