const baseConverters = new Map();
const customConverters = new Map();
let openCcModulePromise = null;

function customDictionaryToken(index) {
  const high = Math.floor(index / 100);
  const low = index % 100;
  return String.fromCharCode(
    0xE000,
    0xE100 + high,
    0xE200 + low,
    0xE001,
  );
}

export async function getConverter(
  config,
  customDictionary,
  loadOpenCc,
  onProgress = () => {},
) {
  if (typeof loadOpenCc !== "function") {
    throw new TypeError("An OpenCC module loader is required.");
  }
  if (!openCcModulePromise) {
    onProgress({
      phase: "initializing-opencc",
      percent: 0,
      messageKey: "worker.progress.loadingOpenCC",
      messageParameters: {},
    });
    openCcModulePromise = loadOpenCc();
  }
  const { default: OpenCC } = await openCcModulePromise;

  if (!baseConverters.has(config)) {
    onProgress({
      phase: "initializing-dictionary",
      percent: 0,
      messageKey: "worker.progress.loadingDictionary",
      messageParameters: {},
    });
    const converter = OpenCC.Converter({ config });
    baseConverters.set(config, converter);
    await converter("");
  }
  const baseConverter = baseConverters.get(config);
  if (!customDictionary?.entries?.length) return baseConverter;

  const key = `${config}:${customDictionary.id}`;
  if (!customConverters.has(key)) {
    onProgress({
      phase: "initializing-custom-dictionary",
      percent: 0,
      messageKey: "worker.progress.loadingCustomDictionary",
      messageParameters: {},
    });

    const sourceToToken = customDictionary.entries.map(([source], index) => [
      source,
      customDictionaryToken(index),
    ]);
    const tokenToTarget = customDictionary.entries.map(([, target], index) => [
      customDictionaryToken(index),
      target,
    ]);

    const protectConverter = OpenCC.CustomConverter(sourceToToken);
    const restoreConverter = OpenCC.CustomConverter(tokenToTarget);

    if (customConverters.size >= 20) customConverters.clear();
    customConverters.set(key, async (text) => {
      const protectedText = protectConverter(text);
      const convertedText = await baseConverter(protectedText);
      return restoreConverter(convertedText);
    });
  }
  return customConverters.get(key);
}

export function serializeConversionError(error, fallbackMessage = "Conversion failed") {
  return {
    code: error?.code || "conversion-failed",
    name: error?.name || "Error",
    message: error?.message || fallbackMessage,
    messageKey: error?.messageKey || null,
    messageParameters: error?.messageParameters || {},
    stack: error?.stack || null,
    entryName: error?.entryName || null,
    diagnostics: error?.diagnostics || null,
    detail: error?.cause?.message || null,
    cause: error?.cause
      ? {
        name: error.cause.name || "Error",
        message: error.cause.message || String(error.cause),
        stack: error.cause.stack || null,
      }
      : null,
  };
}
