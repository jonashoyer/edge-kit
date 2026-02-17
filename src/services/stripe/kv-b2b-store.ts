import type { Nullable } from '../../utils/type-utils';
import type { AbstractKeyValueService } from '../key-value/abstract-key-value';
import { AbstractStripeB2BStore } from './abstract-stripe-store';
import { stripeKeyNamespace } from './stripe-keys';
import type {
  OrganizationSubscriptionData,
  StripeSubscription,
  SubscriptionOfferData,
} from './types';

export class StripeB2BKVStore extends AbstractStripeB2BStore {
  constructor(private kvService: AbstractKeyValueService) {
    super();
  }

  async setUserToCustomerMapping(
    userId: string,
    stripeCustomerId: string
  ): Promise<void> {
    const key = stripeKeyNamespace.key('userToCustomer', userId);
    await this.kvService.set(key, stripeCustomerId);
  }

  async getStripeCustomerId(userId: string): Promise<Nullable<string>> {
    const key = stripeKeyNamespace.key('userToCustomer', userId);
    return this.kvService.get<string>(key);
  }

  async setCustomerSubscriptionData(
    stripeCustomerId: string,
    subscriptionData: StripeSubscription
  ): Promise<void> {
    const key = stripeKeyNamespace.key(
      'customerSubscription',
      stripeCustomerId
    );
    await this.kvService.set(key, subscriptionData);
  }

  async getCustomerSubscriptionData(
    stripeCustomerId: string
  ): Promise<Nullable<StripeSubscription>> {
    const key = stripeKeyNamespace.key(
      'customerSubscription',
      stripeCustomerId
    );
    return this.kvService.get<StripeSubscription>(key);
  }

  async getUserSubscriptionData(
    userId: string
  ): Promise<Nullable<StripeSubscription>> {
    const customerId = await this.getStripeCustomerId(userId);
    if (!customerId) return null;
    return this.getCustomerSubscriptionData(customerId);
  }

  async setOrganizationToCustomerMapping(
    orgId: string,
    stripeCustomerId: string
  ): Promise<void> {
    await this.kvService.set(
      stripeKeyNamespace.key('orgToCustomer', orgId),
      stripeCustomerId
    );
    await this.kvService.set(
      stripeKeyNamespace.key('customerToOrg', stripeCustomerId),
      orgId
    );
  }

  async getStripeCustomerIdByOrg(orgId: string): Promise<Nullable<string>> {
    return this.kvService.get<string>(
      stripeKeyNamespace.key('orgToCustomer', orgId)
    );
  }

  async getOrganizationByCustomerId(
    stripeCustomerId: string
  ): Promise<Nullable<string>> {
    return this.kvService.get<string>(
      stripeKeyNamespace.key('customerToOrg', stripeCustomerId)
    );
  }

  async setOrganizationSubscription(
    orgId: string,
    data: OrganizationSubscriptionData
  ): Promise<void> {
    await this.kvService.set(
      stripeKeyNamespace.key('orgSubscription', orgId),
      data
    );
  }

  async getOrganizationSubscription(
    orgId: string
  ): Promise<Nullable<OrganizationSubscriptionData>> {
    return this.kvService.get<OrganizationSubscriptionData>(
      stripeKeyNamespace.key('orgSubscription', orgId)
    );
  }

  async setSubscriptionOffer(
    orgId: string,
    offer: SubscriptionOfferData
  ): Promise<void> {
    await this.kvService.set(stripeKeyNamespace.key('orgOffer', orgId), offer);
  }

  async getSubscriptionOffer(
    orgId: string
  ): Promise<Nullable<SubscriptionOfferData>> {
    return this.kvService.get<SubscriptionOfferData>(
      stripeKeyNamespace.key('orgOffer', orgId)
    );
  }

  async removeSubscriptionOffer(orgId: string): Promise<void> {
    await this.kvService.delete(stripeKeyNamespace.key('orgOffer', orgId));
  }

  // For portability, default to permissive stubs; users should override in concrete stores
  async getUserOrganizations(_userId: string): Promise<string[]> {
    return [];
  }

  async isUserOrgAdmin(_userId: string, _orgId: string): Promise<boolean> {
    return true;
  }
}
