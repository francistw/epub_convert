const OPTION_IDS = Object.freeze({
  verticalWriting: "vertical-writing-switch",
  convertPunctuation: "taiwan-punctuation-switch",
});

let batchOptions = null;

function currentOptions() {
  return {
    verticalWriting: Boolean(document.getElementById(OPTION_IDS.verticalWriting)?.checked),
    convertPunctuation: Boolean(document.getElementById(OPTION_IDS.convertPunctuation)?.checked),
  };
}

function installWorkerOptionBridge() {
  const originalPostMessage = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function postMessage(message, transfer) {
    let nextMessage = message;
    if (message?.type === "convert" && message.bytes instanceof ArrayBuffer) {
      nextMessage = {
        ...message,
        epubOptions: message.epubOptions ?? batchOptions ?? currentOptions(),
      };
    }
    return transfer === undefined
      ? originalPostMessage.call(this, nextMessage)
      : originalPostMessage.call(this, nextMessage, transfer);
  };
}

function createSwitch(id, label, help) {
  const wrapper = document.createElement("div");
  wrapper.className = "column is-4-wide epub-format-option";

  const row = document.createElement("span");
  row.className = "ts-wrap is-compact is-middle-aligned";

  const switchLabel = document.createElement("label");
  switchLabel.className = "ts-switch";
  switchLabel.tabIndex = 0;
  switchLabel.title = help;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  switchLabel.append(input, document.createTextNode(` ${label}`));

  const description = document.createElement("span");
  description.className = "ts-text is-description has-start-spaced-small";
  description.textContent = help;

  row.append(switchLabel, description);
  wrapper.append(row);
  return { wrapper, input };
}

function installControls() {
  const grid = document.querySelector("#settings-details .ts-fieldset .ts-grid");
  if (!grid || document.getElementById(OPTION_IDS.verticalWriting)) return;

  const vertical = createSwitch(
    OPTION_IDS.verticalWriting,
    "轉換為直排",
    "在 OPF 加入 vertical-rl，並將 spine 翻頁方向設為 rtl。",
  );
  const punctuation = createSwitch(
    OPTION_IDS.convertPunctuation,
    "轉換台灣中文引號",
    "將 “ ” 轉為 「 」，並將 ‘ ’ 轉為 『 』。",
  );

  grid.append(vertical.wrapper, punctuation.wrapper);

  const controls = [vertical.input, punctuation.input];
  const dropzone = document.getElementById("dropzone");
  const syncDisabled = () => {
    const converting = dropzone?.dataset.state === "converting";
    controls.forEach((control) => { control.disabled = converting; });
    if (!converting) batchOptions = null;
  };

  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#convert-button")) batchOptions = currentOptions();
  }, true);

  if (dropzone) {
    new MutationObserver(syncDisabled).observe(dropzone, {
      attributes: true,
      attributeFilter: ["data-state"],
    });
  }
  syncDisabled();
}

installWorkerOptionBridge();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installControls, { once: true });
} else {
  installControls();
}
