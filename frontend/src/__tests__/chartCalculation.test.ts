import { describe, it, expect } from 'vitest';

interface DistributionPoint {
  year: number;
  rate: number;
}

// Extract the chart calculation logic for testing
function calculateDecadeAverages(distribution: DistributionPoint[]) {
  const decadeData: Record<string, number[]> = {};
  for (const point of distribution) {
    const decade = `${Math.floor(point.year / 10) * 10}s`;
    if (!decadeData[decade]) decadeData[decade] = [];
    decadeData[decade].push(point.rate);
  }

  const decades = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
  const decadeAverages = decades.map(d => {
    const rates = decadeData[d] || [];
    return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  });

  return { decadeData, decades, decadeAverages };
}

function calculateBarHeights(decadeAverages: number[]) {
  const maxRate = Math.max(...decadeAverages, 0.1);
  return decadeAverages.map(avg => {
    const heightPercent = Math.max((avg / maxRate) * 100, 4);
    return heightPercent;
  });
}

describe('Chart Calculation', () => {
  it('should handle distribution with only recent years', () => {
    // Simulate typical TMDB data - mostly 2010s-2020s celebrities
    const distribution: DistributionPoint[] = [
      { year: 2015, rate: 0.8 },
      { year: 2016, rate: 0.7 },
      { year: 2017, rate: 0.9 },
      { year: 2020, rate: 0.6 },
      { year: 2021, rate: 0.5 },
    ];

    const { decadeAverages } = calculateDecadeAverages(distribution);
    const heights = calculateBarHeights(decadeAverages);

    // 1960s-2000s should have 0 averages but still render with minimum height
    expect(decadeAverages[0]).toBe(0); // 1960s
    expect(decadeAverages[1]).toBe(0); // 1970s
    expect(decadeAverages[2]).toBe(0); // 1980s
    expect(decadeAverages[3]).toBe(0); // 1990s
    expect(decadeAverages[4]).toBe(0); // 2000s
    expect(decadeAverages[5]).toBeGreaterThan(0); // 2010s
    expect(decadeAverages[6]).toBeGreaterThan(0); // 2020s

    // All bars should have minimum 4% height
    heights.forEach(height => {
      expect(height).toBeGreaterThanOrEqual(4);
    });

    // 2010s should have the tallest bar (highest average)
    const avg2010s = (0.8 + 0.7 + 0.9) / 3;
    expect(decadeAverages[5]).toBeCloseTo(avg2010s);
  });

  it('should correctly identify peak decade', () => {
    const distribution: DistributionPoint[] = [
      { year: 1975, rate: 0.9 },
      { year: 1976, rate: 0.85 },
      { year: 2010, rate: 0.5 },
      { year: 2015, rate: 0.6 },
    ];

    const { decades, decadeAverages } = calculateDecadeAverages(distribution);
    const maxIndex = decadeAverages.indexOf(Math.max(...decadeAverages));

    expect(decades[maxIndex]).toBe('1970s');
  });

  it('should handle empty distribution gracefully', () => {
    const distribution: DistributionPoint[] = [];
    const { decadeAverages } = calculateDecadeAverages(distribution);
    const heights = calculateBarHeights(decadeAverages);

    // All should be 0
    decadeAverages.forEach(avg => expect(avg).toBe(0));

    // But bars should still have minimum height
    heights.forEach(height => expect(height).toBeGreaterThanOrEqual(4));
  });

  it('should calculate correct averages across decades', () => {
    const distribution: DistributionPoint[] = [
      { year: 1980, rate: 0.4 },
      { year: 1985, rate: 0.6 },
      { year: 1989, rate: 0.5 },
    ];

    const { decadeAverages } = calculateDecadeAverages(distribution);

    // 1980s average should be (0.4 + 0.6 + 0.5) / 3 = 0.5
    expect(decadeAverages[2]).toBeCloseTo(0.5);
  });

  it('should render bars with visible heights when data exists', () => {
    const distribution: DistributionPoint[] = [
      { year: 2010, rate: 1.0 },
      { year: 2015, rate: 0.8 },
    ];

    const { decadeAverages } = calculateDecadeAverages(distribution);
    const heights = calculateBarHeights(decadeAverages);

    // 2010s bar should be at 100% (it's the max)
    expect(heights[5]).toBe(100);

    // Empty decades should have minimum 4% height
    expect(heights[0]).toBe(4);
    expect(heights[1]).toBe(4);
    expect(heights[2]).toBe(4);
    expect(heights[3]).toBe(4);
    expect(heights[4]).toBe(4);
  });
});
