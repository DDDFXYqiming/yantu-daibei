import { Platform } from 'react-native';
import { PurchaseState } from '../types';

declare const process: { env?: Record<string, string | undefined> };
declare const require: any;

const ENTITLEMENT = 'premium';

function env(name: string): string | undefined {
  return process?.env?.[name];
}

function now(): string {
  return new Date().toISOString();
}

function localState(isPremium: boolean): PurchaseState {
  return { isPremium, source: 'local', checkedAt: now() };
}

function getApiKey(): string | undefined {
  return Platform.OS === 'ios'
    ? env('EXPO_PUBLIC_REVENUECAT_IOS_KEY')
    : env('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY');
}

function nativePurchasesEnabled(): boolean {
  return env('EXPO_PUBLIC_ENABLE_STORE_PURCHASES') === 'true'
    && env('EXPO_PUBLIC_USE_MOCK_PURCHASES') === 'false'
    && !!getApiKey();
}

async function getPurchasesModule(): Promise<any | null> {
  try {
    const mod = require('react-native-purchases');
    return mod?.default ?? mod;
  } catch (error) {
    console.warn('Native purchase module unavailable; using local purchase state.', error);
    return null;
  }
}

export async function configurePurchases(): Promise<void> {
  if (!nativePurchasesEnabled()) return;
  const apiKey = getApiKey();
  if (!apiKey) return;
  const Purchases = await getPurchasesModule();
  if (!Purchases?.configure) return;
  Purchases.configure({ apiKey });
}

export async function getPremiumStatus(localFallback: boolean): Promise<PurchaseState> {
  if (!nativePurchasesEnabled()) return localState(localFallback);
  const Purchases = await getPurchasesModule();
  if (!Purchases?.getCustomerInfo) return { isPremium: localFallback, source: 'none', checkedAt: now() };
  try {
    const info = await Purchases.getCustomerInfo();
    return {
      isPremium: !!info?.entitlements?.active?.[ENTITLEMENT],
      source: 'store',
      checkedAt: now(),
    };
  } catch (error) {
    console.warn('Failed to check store entitlement', error);
    return { isPremium: localFallback, source: 'none', checkedAt: now() };
  }
}

export async function purchaseLifetime(): Promise<PurchaseState> {
  if (!nativePurchasesEnabled()) return localState(true);
  const Purchases = await getPurchasesModule();
  if (!Purchases?.getOfferings || !Purchases?.purchasePackage) {
    throw new Error('Store purchase module is not available.');
  }
  const offerings = await Purchases.getOfferings();
  const pkg = offerings?.current?.availablePackages?.[0];
  if (!pkg) throw new Error('No purchase package found.');
  const result = await Purchases.purchasePackage(pkg);
  return {
    isPremium: !!result?.customerInfo?.entitlements?.active?.[ENTITLEMENT],
    source: 'store',
    checkedAt: now(),
  };
}

export async function restorePurchases(localFallback = false): Promise<PurchaseState> {
  if (!nativePurchasesEnabled()) return localState(localFallback);
  const Purchases = await getPurchasesModule();
  if (!Purchases?.restorePurchases) throw new Error('Store purchase module is not available.');
  const info = await Purchases.restorePurchases();
  return {
    isPremium: !!info?.entitlements?.active?.[ENTITLEMENT],
    source: 'store',
    checkedAt: now(),
  };
}
