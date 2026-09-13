function createScene1() {
  return {
    location: '湘南',
    season: 'summer',
    time: 'sunset',
    visual: 'shonan_sunset',
    sound: 'ocean_wave',
    light: { brightness: 20, color: 'warm' },
    temperature: 26,
    fan: 'low',
    aroma: 'ocean',
  };
}

// Replace this adapter with an LLM call when implementing issue #5.
export function mockGenerateScene(text) {
  if (['湘南', '海', '夕方'].some((keyword) => text.includes(keyword))) {
    return createScene1();
  }
  // Keep the demo usable even when no supported keyword is present.
  return createScene1();
}
