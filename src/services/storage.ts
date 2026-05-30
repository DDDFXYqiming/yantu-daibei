import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData } from '../types';
import { createInitialData } from '../data/seed';

const STORAGE_KEY = 'yantu-daibei:v1';

export async function loadAppData(): Promise<AppData> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialData();
    const parsed = JSON.parse(raw) as AppData;
    return {
      ...createInitialData(),
      ...parsed,
      profile: { ...createInitialData().profile, ...parsed.profile },
      purchase: { ...createInitialData().purchase, ...parsed.purchase },
    };
  } catch (error) {
    console.warn('Failed to load app data', error);
    return createInitialData();
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, lastOpenedAt: new Date().toISOString() }));
}

export async function resetAppData(): Promise<AppData> {
  const next = createInitialData();
  await saveAppData(next);
  return next;
}

export async function exportAppData(data: AppData): Promise<string> {
  return JSON.stringify(data, null, 2);
}

export async function importAppData(raw: string): Promise<AppData> {
  const parsed = JSON.parse(raw) as AppData;
  await saveAppData(parsed);
  return parsed;
}
