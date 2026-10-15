(function(root, factory){
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CuttingJobDimensions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";
  const number = "[+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
  const division = new RegExp(`^(${number})(?:\\s*/\\s*(${number}))?$`);
  function numeric(text){
    const match = text.match(division);
    if (!match) return NaN;
    const numerator = Number(match[1]), denominator = match[2] == null ? 1 : Number(match[2]);
    const result = numerator / denominator;
    return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 && Number.isFinite(result) ? result : NaN;
  }
  function inches(text){
    const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (!mixed) return numeric(text);
    const whole = Number(mixed[1]), numerator = Number(mixed[2]), denominator = Number(mixed[3]);
    return denominator > 0 && numerator < denominator ? whole + numerator / denominator : NaN;
  }
  function parseFeet(value){
    const text = String(value ?? "").trim().replace(/[′’]/g, "'").replace(/[″“”]/g, '"');
    const feetAndInches = text.match(new RegExp(`^(${number})\\s*'(?:\\s*(?:-\\s*)?(.+)\\s*")?$`));
    let feet;
    if (feetAndInches){
      const footPart = Number(feetAndInches[1]);
      const inchPart = feetAndInches[2] == null ? 0 : inches(feetAndInches[2].trim());
      feet = footPart + inchPart / 12;
    } else if (text.endsWith('"')){
      feet = inches(text.slice(0, -1).trim()) / 12;
    } else {
      feet = numeric(text);
    }
    return Number.isFinite(feet) && feet >= 0 ? feet : NaN;
  }
  function formatFeet(value){
    if (!Number.isFinite(value) || value < 0) return "";
    const ticks = Math.round(value * 12 * 16);
    if (!Number.isSafeInteger(ticks)) return "";
    const feet = Math.floor(ticks / 192), remainder = ticks % 192;
    const wholeInches = Math.floor(remainder / 16), numerator = remainder % 16;
    const gcd = (a,b) => b ? gcd(b,a % b) : a;
    const divisor = numerator ? gcd(numerator,16) : 1;
    const fraction = numerator ? ` ${numerator / divisor}/${16 / divisor}` : "";
    return `${feet}'-${wholeInches}${fraction}"`;
  }
  // A rounded blur display never becomes the calculation/storage value unless edited.
  function readInput(input){
    if (!input) return NaN;
    return input.dataset?.dimensionDisplay === input.value && input.dataset?.dimensionFeet !== undefined
      ? Number(input.dataset.dimensionFeet) : parseFeet(input.value);
  }
  function draftValue(input){
    return input?.dataset?.dimensionDisplay === input?.value && input?.dataset?.dimensionFeet !== undefined
      ? input.dataset.dimensionFeet : (input?.value || "");
  }
  function updateInput(input, preview, normalize = false){
    const value = readInput(input), empty = !input.value.trim();
    const invalid = !empty && (!Number.isFinite(value) || value <= 0);
    input.setCustomValidity(invalid ? 'Enter positive feet, a fraction, inches (24"), or feet and inches.' : "");
    const display = !invalid && !empty ? formatFeet(value) : "";
    if (preview) preview.textContent = display ? `≈ ${display} (nearest 1/16 in)` : (invalid ? input.validationMessage : "Feet, inches, or a fraction");
    if (normalize && display){
      input.dataset.dimensionFeet = String(value);
      input.dataset.dimensionDisplay = display;
      input.value = display;
    }
    return value;
  }
  return Object.freeze({parseFeet, formatFeet, readInput, draftValue, updateInput});
});
