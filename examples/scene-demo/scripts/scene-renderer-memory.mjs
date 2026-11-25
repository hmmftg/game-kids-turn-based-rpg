export async function readSceneRendererMemory(page) {
  return page.evaluate(() => window.__sceneProbe?.readRendererMemory?.() ?? null);
}

export async function waitForSceneRendererMemoryWithinTolerance(page, baseline, label) {
  const tolerance = { geometries: 1, textures: 1 };
  try {
    await page.waitForFunction(
      ({ baselineMemory, allowedGrowth }) => {
        const memory = window.__sceneProbe?.readRendererMemory?.();
        return (
          memory !== null &&
          memory !== undefined &&
          memory.geometries <= baselineMemory.geometries + allowedGrowth.geometries &&
          memory.textures <= baselineMemory.textures + allowedGrowth.textures
        );
      },
      { baselineMemory: baseline, allowedGrowth: tolerance },
      { polling: 100, timeout: 15_000 },
    );
  } catch (error) {
    const current = await readSceneRendererMemory(page);
    throw new Error(
      `${label} exceeded the renderer-memory tolerance after idle disposal: ${JSON.stringify({ baseline, current, tolerance })}`,
      { cause: error },
    );
  }
  return readSceneRendererMemory(page);
}
