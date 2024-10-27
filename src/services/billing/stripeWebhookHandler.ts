import Stripe from 'stripe';
import { StripeBillingManager } from './stripeBillingManager';
import { CustomError } from '../../utils/customError';
import type { Readable } from 'node:stream';

type StripeWebhookErrorType = 'MISSING_PAYLOAD_OR_SIGNATURE' | 'INVALID_WEBHOOK_PAYLOAD';

export class StripeWebhookError extends CustomError<StripeWebhookErrorType> {
  constructor(message: string, code: StripeWebhookErrorType) {
    super(message, code);
  }
}



export class StripeWebhookHandler {
  private paymentManager: StripeBillingManager<any, any>;
  private endpointSecret: string;

  constructor(paymentManager: StripeBillingManager<any, any>, endpointSecret: string) {
    this.paymentManager = paymentManager;
    this.endpointSecret = endpointSecret;
  }

  /**
   * Handle a Stripe webhook event
   * @param payload - The payload of the webhook event `req.body`
   * @param signature - The signature of the webhook event `req.headers['stripe-signature']`
   */
  async handleWebhook(payload: string | Buffer, signature: string) {

    if (!payload || !signature) {
      throw new StripeWebhookError('Missing payload or signature', 'MISSING_PAYLOAD_OR_SIGNATURE');
    }

    let event: Stripe.Event;

    try {
      event = this.paymentManager.stripe.webhooks.constructEvent(payload, signature, this.endpointSecret);
    } catch (err) {

      console.error(`Webhook Error: ${(err as Error).message}`);
      throw new StripeWebhookError('Invalid webhook payload', 'INVALID_WEBHOOK_PAYLOAD');
    }

    switch (event.type) {
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.trial_will_end':
        await this.handleSubscriptionTrialWillEnd(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      // Add more event types as needed
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  }

  private async handleSubscriptionCreated(subscription: Stripe.Subscription) {
    console.log('Subscription created:', subscription.id);
    // Implement your logic here, e.g., update user's subscription status in your database
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    console.log('Subscription updated:', subscription.id);
    // Implement your logic here, e.g., update user's subscription details in your database
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    console.log('Subscription deleted:', subscription.id);
    // Implement your logic here, e.g., update user's subscription status in your database
  }

  private async handleSubscriptionTrialWillEnd(subscription: Stripe.Subscription) {
    console.log('Subscription trial will end:', subscription.id);
    // Implement your logic here, e.g., notify user of trial end, offer a discount to convert to a paid plan
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    console.log('Invoice payment succeeded:', invoice.id);
    // Implement your logic here, e.g., record successful payment in your database
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    console.log('Invoice payment failed:', invoice.id);
    // Implement your logic here, e.g., notify user of failed payment, attempt to retry payment
  }

  async getRawBody(readable: Readable) {
    const chunks = [];
    for await (const chunk of readable) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }
}

export default StripeWebhookHandler;
