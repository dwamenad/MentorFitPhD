import Stripe from 'stripe';

import type { SubscriptionStatus } from '../../src/types';
import { getAppUrl } from './auth';
import { attachStripeCustomerToUser, updateUserByStripeCustomerId, updateUserBilling, type StoredUser } from './store';

let stripeClient: Stripe | null = null;

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-03-25.dahlia',
    });
  }

  return stripeClient;
}

function mapStripeStatus(status: string | null | undefined): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'incomplete':
    case 'incomplete_expired':
      return 'checkout_pending';
    default:
      return 'inactive';
  }
}

export function isStripeBillingConfigured() {
  return Boolean(getStripeClient() && process.env.STRIPE_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET);
}

export async function createCheckoutSession(user: StoredUser) {
  const stripe = getStripeClient();
  const priceId = process.env.STRIPE_PRICE_ID?.trim();

  if (!stripe || !priceId) {
    throw new Error('Stripe billing is not configured.');
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    success_url: `${getAppUrl()}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getAppUrl()}?billing=cancel`,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    customer: user.stripeCustomerId,
    customer_email: user.stripeCustomerId ? undefined : user.email,
    client_reference_id: user.id,
    metadata: {
      userId: user.id,
    },
    subscription_data: {
      metadata: {
        userId: user.id,
      },
    },
  });

  if (typeof session.customer === 'string') {
    await attachStripeCustomerToUser(user.id, session.customer);
  }

  await updateUserBilling(user.id, {
    subscriptionStatus: 'checkout_pending',
  });

  if (!session.url) {
    throw new Error('Stripe checkout did not return a redirect URL.');
  }

  return session;
}

export function constructWebhookEvent(payload: Buffer, signature: string | undefined) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!stripe || !webhookSecret || !signature) {
    throw new Error('Stripe webhook is not configured.');
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export async function handleWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId || session.client_reference_id;

      if (!userId) {
        break;
      }

      await updateUserBilling(userId, {
        plan: 'pro',
        subscriptionStatus: session.payment_status === 'paid' ? 'active' : 'checkout_pending',
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : undefined,
        stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : undefined,
      });
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
      if (!customerId) {
        break;
      }

      await updateUserByStripeCustomerId(customerId, (user) => {
        user.plan = subscription.status === 'active' || subscription.status === 'trialing' ? 'pro' : user.plan;
        user.subscriptionStatus = mapStripeStatus(subscription.status);
        user.stripeSubscriptionId = subscription.id;
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
      if (!customerId) {
        break;
      }

      await updateUserByStripeCustomerId(customerId, (user) => {
        user.plan = 'free';
        user.subscriptionStatus = 'canceled';
        user.stripeSubscriptionId = subscription.id;
      });
      break;
    }

    default:
      break;
  }
}

export async function readCheckoutSession(sessionId: string) {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe billing is not configured.');
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  });

  const subscription =
    typeof session.subscription === 'object' && session.subscription
      ? session.subscription
      : null;

  return {
    status: session.status,
    paymentStatus: session.payment_status,
    subscriptionStatus: subscription ? mapStripeStatus(subscription.status) : null,
  };
}
