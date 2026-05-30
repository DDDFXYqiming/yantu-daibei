import { Platform } from 'react-native';
import { PurchaseState } from '../types';

declare const process: { env?: Record<string, string | undefined> };
declare const require: any;

const ENTITLEMENT = 'premium';

function env(name: string): string | undefined {
  return process?.env?.[name];
}

function useMock(): boolean {
  return env('EXPO_PUBLIC_USE_MOCK_PURCHASES') !== 'false';
}

function getApiKey(): string | undefined {
  return Platform.OS === 'ios'
    ? env('EXPO_PUBLIC_REVENUECAT_IOS_KEY')
    : env('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY');
}

async function getPurchasesModule(): Promise<any | null> {
  try {
    const mod = require('react-native-purchases');
    return mod?.default ?? mod;
  } catch (error) {
    console.warn('RevenueCat SDK not available, falling back to mock purchases.', error);
    return null;
  }
}

export async function configurePurchases(): Promise<void> {
  if (useMock()) return;
  const apiKey = getApiKey();
  if (!apiKey) return;
  const Purchases = await getPurchasesModule();
  if (!Purchases?.configure) return;
  Purchases.configure({ apiKey });
}

export async function getPremiumStatus(localFallback: boolean): Promise<PurchaseState> {
  if (useMock()) return { isPremium: localFallback, source: 'mock', checkedAt: new Date().toISOString() };
  const Purchases = await getPurchasesModule();
  if (!Purchases?.getCustomerInfo) return { isPremium: localFallback, source: 'none', checkedAt: new Date().toISOString() };
  try {
    const info = await Purchases.getCustomerInfo();
    return {
      isPremium: !!info?.entitlements?.active?.[ENTITLEMENT],
      source: 'revenuecat',
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn('Failed to check RevenueCat entitlement', error);
    return { isPremium: localFallback, source: 'none', checkedAt: new Date().toISOString() };
  }
}

export async function purchaseLifetime(): Promise<PurchaseState> {
  if (useMock()) return { isPremium: true, source: 'mock', checkedAt: new Date().toISOString() };
  const Purchases = await getPurchasesModule();
  if (!Purchases?.getOfferings || !Purchases?.purchasePackage) {
    throw new Error('RevenueCat SDK not available. Use a development build and install react-native-purchases.');
  }
  const offerings = await Purchases.getOfferings();
  const pkg = offerings?.current?.availablePackages?.[0];
  if (!pkg) throw new Error('No RevenueCat package found. Configure offering: default / pro_lifetime.');
  const result = await Purchases.purchasePackage(pkg);
  return {
    isPremium: !!result?.customerInfo?.entitlements?.active?.[ENTITLEMENT],
    source: 'revenuecat',
    checkedAt: new Date().toISOString(),
  };
}

export async function restorePurchases(): Promise<PurchaseState> {
  if (useMock()) return { isPremium: true, source: 'mock', checkedAt: new Date().toISOString() };
  const Purchases = await getPurchasesModule();
  if (!Purchases?.restorePurchases) throw new Error('RevenueCat SDK not available.');
  const info = await Purchases.restorePurchases();
  return {
    isPremium: !!info?.entitlements?.active?.[ENTITLEMENT],
    source: 'revenuecat',
    checkedAt: new Date().toISOString(),
  };
}
