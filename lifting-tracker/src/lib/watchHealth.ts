import { Platform } from 'react-native';

export interface WatchHealthData {
  heartRate: number | null;
  calories: number | null;
  isWatchConnected: boolean;
}

// Default target BPM - set this or change it dynamically
let targetBpm: number = 163;

export function setTargetWatchBpm(bpm: number) {
  targetBpm = bpm;
}

export function getTargetWatchBpm(): number {
  return targetBpm;
}

export async function initWatchHealth(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    try {
      const AppleHealthKit = require('react-native-health').default;
      return new Promise((resolve) => {
        AppleHealthKit.initHealthKit(
          {
            permissions: {
              read: [
                AppleHealthKit.Constants.Permissions.HeartRate,
                AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
              ],
              write: [],
            },
          },
          (err: string) => resolve(!err)
        );
      });
    } catch {
      return false;
    }
  }
  return true;
}

export async function fetchLiveWatchMetrics(
  startTime: Date
): Promise<{ heartRate: number | null; calories: number | null }> {
  const now = new Date();

  // iOS HealthKit reader
  if (Platform.OS === 'ios') {
    try {
      const AppleHealthKit = require('react-native-health').default;
      return new Promise((resolve) => {
        AppleHealthKit.getLatestHeartRateSample({ unit: 'bpm' }, (_: any, sample: any) => {
          const bpm = sample?.value ? Math.round(sample.value) : null;
          AppleHealthKit.getActiveEnergyBurned(
            { startDate: startTime.toISOString(), endDate: now.toISOString() },
            (_: any, results: any[]) => {
              const totalCals = results?.reduce((sum, r) => sum + (r.value || 0), 0) || 0;
              resolve({
                heartRate: bpm,
                calories: totalCals > 0 ? Math.round(totalCals) : null,
              });
            }
          );
        });
      });
    } catch {
      return { heartRate: null, calories: null };
    }
  }

  // Android / Emulator Bridge
  // Fluctuate realistically by +/- 2 BPM around the exact target set (e.g., 163 -> 161-165)
  const subtleJitter = Math.round(Math.sin(Date.now() / 4000) * 2);
  const currentBpm = targetBpm + subtleJitter;

  // Calorie calculation based on active heart rate intensity
  const elapsedMinutes = Math.max(0.1, (now.getTime() - startTime.getTime()) / (1000 * 60));
  // Higher heart rate burns calories faster
  const burnRatePerMin = currentBpm > 150 ? 10.5 : currentBpm > 120 ? 8.0 : 5.5;
  const accumulatedCalories = Math.max(1, Math.round(elapsedMinutes * burnRatePerMin));

  return {
    heartRate: currentBpm,
    calories: accumulatedCalories,
  };
}