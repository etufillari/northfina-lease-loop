import { expect, it } from 'vitest';
import { batteryAssessment, inspectionPartCost, laptopPartCost, laptopTier } from './laptop-parts';

it('prices parts by laptop class, at its boundaries', () => {
  expect(laptopTier(79_999)).toBe('budget');
  expect(laptopTier(80_000)).toBe('mainstream');
  expect(laptopTier(199_999)).toBe('mainstream');
  expect(laptopTier(200_000)).toBe('premium');
  expect(laptopPartCost('screen', 79_999)).toBeLessThan(laptopPartCost('screen', 200_000));
});

it('keeps small jobs small', () => {
  expect(laptopPartCost('wifi_card', 200_000)).toBeLessThan(laptopPartCost('motherboard', 80_000));
});

it('suggests a cost for an inspector, only where a part is clear', () => {
  expect(inspectionPartCost('display', 150_000)).toBe(16_000);
  expect(inspectionPartCost('serial_match', 150_000)).toBeNull();
});

it('judges battery health against age', () => {
  expect(batteryAssessment(70, 2)).toMatchObject({ needsReplacement: true, customerPays: true });
  expect(batteryAssessment(70, 24)).toMatchObject({ needsReplacement: true, customerPays: false });
  expect(batteryAssessment(85, 2)).toMatchObject({ needsReplacement: false, customerPays: false });
  expect(batteryAssessment(50, 60).normalFloorPercent).toBe(60);
  expect(batteryAssessment(50, 60).customerPays).toBe(true);
});
