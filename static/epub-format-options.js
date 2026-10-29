const OPTION_IDS = Object.freeze({
  verticalWriting: "vertical-writing-switch",
  convertPunctuation: "taiwan-punctuation-switch",
});

const SUMMARY_IDS = Object.freeze({
  verticalWriting: "vertical-writing-summary-chip",
  convertPunctuation: "taiwan-punctuation-summary-chip",
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

function createHelpIcon(help) {
  const icon = document.createElement("span");
  icon.className = "ts-icon is-circle-question-icon";
  icon.tabIndex = 0;
  icon.setAttribute("role", "button");
  icon.setAttribute("aria-label", help);
  icon.setAttribute("data-tooltip", help);
  icon.setAttribute("data-trigger", "hover focus");
  return icon;
}

function createSwitch(id, label, help) {
  const wrapper = document.createElement("div");
  wrapper.className = "column is-4-wide epub-format-option";

  const row = document.createElement("span");
  row.className = "ts-wrap is-compact is-middle-aligned";

  const switchLabel = document.createElement("label");
  switchLabel.className = "ts-switch";
  switchLabel.tabIndex = 0;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.defaultChecked = true;
  input.checked = true;
  input.setAttribute("checked", "");
  input.setAttribute("aria-description", help);
  switchLabel.append(input, document.createTextNode(` ${label}`));

  row.append(switchLabel, createHelpIcon(help));
  wrapper.append(row);
  return { wrapper, input };
}

function setSummaryChip(id, label, enabled) {
  const summary = document.querySelector("#settings-details > summary");
  if (!summary) return;

  let chip = document.getElementById(id);
  if (!enabled) {
    chip?.remove();
    return;
  }
  if (chip) return;

  chip = document.createElement("span");
  chip.id = id;
  chip.className = "ts-chip is-small is-start-spaced";
  chip.textContent = label;

  const summarySwitches = summary.querySelector(".summary-switches");
  if (summarySwitches) summary.insertBefore(chip, summarySwitches);
  else summary.append(chip);
}

function syncSummaryChips() {
  const options = currentOptions();
  setSummaryChip(SUMMARY_IDS.verticalWriting, "直排", options.verticalWriting);
  setSummaryChip(SUMMARY_IDS.convertPunctuation, "引號轉換", options.convertPunctuation);
}

function installControls() {
  const grid = document.querySelector("#settings-details .ts-fieldset .ts-grid");
  if (!grid || document.getElementById(OPTION_IDS.verticalWriting)) return;

  const vertical = createSwitch(
    OPTION_IDS.verticalWriting,
    "轉換為直排",
    "在 OPF 加入 vertical-rl，將 spine 翻頁方向設為 rtl，並在 EPUB 樣式中套用直排 writing-mode。",
  );
  const punctuation = createSwitch(
    OPTION_IDS.convertPunctuation,
    "轉換台灣中文引號",
    "將 “ ” 轉為 「 」，並將 ‘ ’ 轉為 『 』。",
  );

  grid.append(vertical.wrapper, punctuation.wrapper);

  const controls = [vertical.input, punctuation.input];
  controls.forEach((control) => control.addEventListener("change", syncSummaryChips));
  syncSummaryChips();

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
