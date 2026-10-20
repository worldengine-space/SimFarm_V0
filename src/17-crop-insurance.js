// Optional, explicitly fictional crop insurance. Its policy state is saved in
// the versioned SFMX wrapper; native SFM bytes remain unchanged.

const cropInsuranceTerms = {
  premiumRate: 0.05,
  deductibleRate: 0.2,
  payoutCapRate: 0.5,
};

function freshFarmExtensionState() {
  return {
    version: 1,
    cropInsurancePolicies: [],
    cropInsurancePremiums: 0,
    cropInsuranceClaims: 0,
    conservationContracts: [],
    conservationPayments: 0,
    conservationWithdrawals: 0,
  };
}

function normalizeFarmExtensionState(value) {
  if (!value || value.version !== 1) {
    throw new Error("Unsupported SimFarm extension version.");
  }
  if (
    !Array.isArray(value.cropInsurancePolicies) ||
    value.cropInsurancePolicies.length > 96
  ) {
    throw new Error("Invalid SimFarm crop insurance policy list.");
  }
  const policies = [];
  const seenSlots = new Set();
  for (const candidate of value.cropInsurancePolicies) {
    const policy = {
      fieldSlot: Number(candidate?.fieldSlot),
      cropSlot: Number(candidate?.cropSlot),
      referencePrice: Number(candidate?.referencePrice),
      expectedValue: Number(candidate?.expectedValue),
      premium: Number(candidate?.premium),
    };
    if (
      !Number.isInteger(policy.fieldSlot) ||
      policy.fieldSlot < 1 ||
      policy.fieldSlot >= (saveData?.format?.fieldRecordCount ?? 98) ||
      seenSlots.has(policy.fieldSlot) ||
      !Number.isInteger(policy.cropSlot) ||
      policy.cropSlot < 0 ||
      policy.cropSlot >= cropImageNames.length ||
      !Number.isInteger(policy.referencePrice) ||
      policy.referencePrice < 1 ||
      policy.referencePrice > 0xffff ||
      !Number.isSafeInteger(policy.expectedValue) ||
      policy.expectedValue < 1 ||
      !Number.isSafeInteger(policy.premium) ||
      policy.premium < 1
    ) {
      throw new Error("Invalid SimFarm crop insurance policy.");
    }
    const expectedValue =
      (cropHarvestQuantities.get(cropSlotName(policy.cropSlot)) ?? 0) *
      Math.floor(policy.referencePrice / 10);
    const expectedPremium = Math.max(
      1,
      Math.ceil(expectedValue * cropInsuranceTerms.premiumRate),
    );
    if (
      policy.expectedValue !== expectedValue ||
      policy.premium !== expectedPremium
    ) {
      throw new Error("Crop insurance policy terms do not match its quote.");
    }
    seenSlots.add(policy.fieldSlot);
    policies.push(policy);
  }
  const premiums = Number(value.cropInsurancePremiums);
  const claims = Number(value.cropInsuranceClaims);
  const savedContracts = value.conservationContracts ?? [];
  if (!Array.isArray(savedContracts) || savedContracts.length > 144) {
    throw new Error("Invalid SimFarm conservation contract list.");
  }
  const contracts = [];
  const seenParcels = new Set();
  for (const candidate of savedContracts) {
    const contract = {
      parcelX: Number(candidate?.parcelX),
      parcelY: Number(candidate?.parcelY),
      startYear: Number(candidate?.startYear),
      nextPaymentYear: Number(candidate?.nextPaymentYear),
      endYear: Number(candidate?.endYear),
      paymentsMade: Number(candidate?.paymentsMade),
    };
    const parcelKey = `${contract.parcelX},${contract.parcelY}`;
    if (
      !Number.isInteger(contract.parcelX) ||
      contract.parcelX < 0 ||
      contract.parcelX >= (saveData?.format?.parcelGridWidth ?? 12) ||
      !Number.isInteger(contract.parcelY) ||
      contract.parcelY < 0 ||
      contract.parcelY >= (saveData?.format?.parcelGridHeight ?? 12) ||
      seenParcels.has(parcelKey) ||
      !Number.isInteger(contract.startYear) ||
      contract.startYear < 1900 ||
      contract.startYear > 65532 ||
      contract.endYear !== contract.startYear + 3 ||
      !Number.isInteger(contract.paymentsMade) ||
      contract.paymentsMade < 1 ||
      contract.paymentsMade > 3 ||
      contract.nextPaymentYear !== contract.startYear + contract.paymentsMade
    ) {
      throw new Error("Invalid SimFarm conservation contract.");
    }
    seenParcels.add(parcelKey);
    contracts.push(contract);
  }
  const conservationPayments = Number(value.conservationPayments ?? 0);
  const conservationWithdrawals = Number(value.conservationWithdrawals ?? 0);
  if (
    !Number.isSafeInteger(premiums) ||
    premiums < 0 ||
    !Number.isSafeInteger(claims) ||
    claims < 0 ||
    !Number.isSafeInteger(conservationPayments) ||
    conservationPayments < 0 ||
    !Number.isSafeInteger(conservationWithdrawals) ||
    conservationWithdrawals < 0
  ) {
    throw new Error("Invalid SimFarm crop insurance accounting.");
  }
  return {
    version: 1,
    cropInsurancePolicies: policies,
    cropInsurancePremiums: premiums,
    cropInsuranceClaims: claims,
    conservationContracts: contracts,
    conservationPayments,
    conservationWithdrawals,
  };
}

function validateFarmExtensionAgainstNativeBytes(bytes, extension) {
  const savedYear = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint16(saveData.format.yearOffset, true);
  for (const policy of extension.cropInsurancePolicies) {
    const offset =
      saveData.format.fieldRecordOffset +
      policy.fieldSlot * saveData.format.fieldRecordSize;
    const record = bytes.subarray(
      offset,
      offset + saveData.format.fieldRecordSize,
    );
    if (
      (record[7] & 1) === 0 ||
      record[2] === 0 ||
      record[14] !== policy.cropSlot
    ) {
      throw new Error("SFMX policy does not match its saved crop field.");
    }
  }
  for (const contract of extension.conservationContracts) {
    if (
      contract.startYear + contract.paymentsMade - 1 !== savedYear ||
      !conservationParcelValidInBytes(bytes, contract.parcelX, contract.parcelY)
    ) {
      throw new Error(
        "SFMX conservation contract does not match an owned vacant parcel.",
      );
    }
  }
  return extension;
}

function cropInsurancePolicy(fieldSlot) {
  return farmExtensionState.cropInsurancePolicies.find(
    (policy) => policy.fieldSlot === fieldSlot,
  );
}

function cropInsuranceQuote(fieldSlot) {
  if (!farmStateBytes || !saveData) return null;
  const record = fieldRecord(fieldSlot);
  if (!record || (record[7] & 1) === 0 || record[2] === 0) return null;
  const cropSlot = record[14];
  if (!Number.isInteger(cropSlot) || cropSlot < 0 || cropSlot >= 24)
    return null;
  const commodity = itemDefinitionForKeyAndId("commodity", 0x80 + cropSlot);
  const quantity = cropHarvestQuantities.get(cropSlotName(cropSlot)) ?? 0;
  const price = commodity?.price ?? 0;
  const expectedValue = quantity * Math.floor(price / 10);
  if (!Number.isSafeInteger(expectedValue) || expectedValue < 1) return null;
  const premium = Math.max(
    1,
    Math.ceil(expectedValue * cropInsuranceTerms.premiumRate),
  );
  return { fieldSlot, cropSlot, referencePrice: price, expectedValue, premium };
}

function purchaseCropInsurance(fieldSlot) {
  if (cropInsurancePolicy(fieldSlot)) return false;
  const quote = cropInsuranceQuote(fieldSlot);
  if (!quote || state.funds < quote.premium) return false;
  const record = fieldRecord(fieldSlot);
  if (!record || (record[7] & 1) === 0 || record[14] !== quote.cropSlot)
    return false;
  state.funds -= quote.premium;
  farmExtensionState.cropInsurancePremiums += quote.premium;
  farmExtensionState.cropInsurancePolicies.push(quote);
  return true;
}

function cancelCropInsurance(fieldSlot) {
  const index = farmExtensionState.cropInsurancePolicies.findIndex(
    (policy) => policy.fieldSlot === fieldSlot,
  );
  if (index < 0) return false;
  farmExtensionState.cropInsurancePolicies.splice(index, 1);
  return true;
}

function settleCropInsurance(record, actualValue = null) {
  const fieldSlot = record ? fieldRecordSlot(record) : -1;
  const policy = cropInsurancePolicy(fieldSlot);
  if (!policy) return 0;
  const payout =
    record[14] === policy.cropSlot
      ? calculateCropInsurancePayout(
          policy.expectedValue,
          actualValue ?? harvestValueAtPrice(record, policy.referencePrice),
        )
      : 0;
  cancelCropInsurance(fieldSlot);
  if (payout > 0) {
    state.funds += payout;
    farmExtensionState.cropInsuranceClaims += payout;
    message = `Crop insurance paid $${payout}.`;
  }
  return payout;
}

function calculateCropInsurancePayout(expectedValue, actualValue) {
  if (
    !Number.isSafeInteger(expectedValue) ||
    expectedValue < 1 ||
    !Number.isSafeInteger(actualValue) ||
    actualValue < 0
  )
    return 0;
  const loss = Math.max(0, expectedValue - actualValue);
  const deductible = Math.floor(
    expectedValue * cropInsuranceTerms.deductibleRate,
  );
  const cap = Math.floor(expectedValue * cropInsuranceTerms.payoutCapRate);
  return Math.min(cap, Math.max(0, loss - deductible));
}

function fieldRecordSlot(record) {
  const offset = record?.byteOffset;
  const base = farmStateBytes?.byteOffset ?? 0;
  const relative = offset - base - saveData.format.fieldRecordOffset;
  return Math.floor(relative / saveData.format.fieldRecordSize);
}

function drawCropInsuranceWindow() {
  const x = 144;
  const y = 80;
  const fields = activeFieldRecords();
  const maxScroll = Math.max(0, fields.length - 8);
  insuranceListScroll = Math.min(insuranceListScroll, maxScroll);
  context.fillStyle = "#c3c3c3";
  context.fillRect(x, y + 16, 352, 288);
  drawText("Fictional optional crop coverage", x + 16, y + 28);
  drawText("Premium 5% | deductible 20% | cap 50%", x + 16, y + 40);
  drawText("Harvest or flood loss | one claim per field", x + 16, y + 52);
  for (let row = 0; row < 8; row += 1) {
    const field = fields[insuranceListScroll + row];
    if (!field) break;
    const rowY = y + 64 + row * 16;
    const selected = field.slot === insuranceSelectedFieldSlot;
    if (selected) {
      context.fillStyle = "#000000";
      context.fillRect(x + 12, rowY - 1, 328, 15);
    }
    const crop = cropSlotName(field.record[14]) || "unknown";
    const insured = cropInsurancePolicy(field.slot) ? "INSURED" : "";
    drawText(
      `Field ${field.slot}: ${crop.slice(0, 12)} ${insured}`,
      x + 16,
      rowY + 2,
      selected ? "white" : "black",
    );
  }
  const selectedPolicy = cropInsurancePolicy(insuranceSelectedFieldSlot);
  const quote = cropInsuranceQuote(insuranceSelectedFieldSlot);
  const action = selectedPolicy
    ? "Cancel Policy"
    : quote
      ? `Insure for $${quote.premium}`
      : "Select a field";
  drawText(
    `Premiums: $${farmExtensionState.cropInsurancePremiums}`,
    x + 16,
    y + 196,
  );
  drawText(
    `Claims paid: $${farmExtensionState.cropInsuranceClaims}`,
    x + 16,
    y + 208,
  );
  drawInsuranceButton(action, x + 32, y + 232, 128);
  drawInsuranceButton("Close", x + 184, y + 232, 64);
  if (fields.length > 8) {
    drawInsuranceButton("Prev", x + 16, y + 260, 48);
    drawInsuranceButton("Next", x + 272, y + 260, 48);
  }
}

function drawInsuranceButton(label, x, y, width) {
  context.fillStyle = "#ffffff";
  context.fillRect(x, y, width, 20);
  context.strokeStyle = "#000000";
  context.strokeRect(x, y, width, 20);
  drawText(label, x + 4, y + 6, "black");
}

function handleCropInsuranceClick(point) {
  const fields = activeFieldRecords();
  if (inside(point, 156, 144, 328, 128)) {
    const row = Math.floor((point.y - 144) / 16);
    insuranceSelectedFieldSlot =
      fields[insuranceListScroll + row]?.slot ?? null;
    return true;
  }
  if (inside(point, 176, 312, 128, 20)) {
    if (insuranceSelectedFieldSlot === null) return true;
    if (cropInsurancePolicy(insuranceSelectedFieldSlot)) {
      cancelCropInsurance(insuranceSelectedFieldSlot);
    } else if (!purchaseCropInsurance(insuranceSelectedFieldSlot)) {
      message = "Unable to insure this field.";
    }
    return true;
  }
  if (inside(point, 328, 312, 64, 20)) {
    closeActiveWindow();
    return true;
  }
  if (inside(point, 160, 340, 48, 20)) {
    insuranceListScroll = Math.max(0, insuranceListScroll - 1);
    return true;
  }
  if (inside(point, 416, 340, 48, 20)) {
    insuranceListScroll = Math.min(
      Math.max(0, fields.length - 8),
      insuranceListScroll + 1,
    );
    return true;
  }
  return true;
}

const conservationTerms = {
  annualPayment: 100,
  termYears: 3,
};

function conservationContract(parcelX, parcelY) {
  return farmExtensionState.conservationContracts.find(
    (contract) => contract.parcelX === parcelX && contract.parcelY === parcelY,
  );
}

function parcelHasActiveStructure(parcelX, parcelY) {
  if (!farmStateBytes || !saveData) return false;
  const left = parcelX * 8;
  const top = parcelY * 8;
  const right = left + 8;
  const bottom = top + 8;
  for (let slot = 1; slot < saveData.format.structureRecordCount; slot += 1) {
    const record = structureRecord(slot);
    const view = stateView(record);
    if ((view.getUint16(2, true) & 0x20) === 0) continue;
    const definition = itemDefinitionForKeyAndId(
      "structure",
      view.getUint16(0, true),
    );
    if (!definition) continue;
    if (
      record[4] < right &&
      record[4] + definition.width > left &&
      record[5] < bottom &&
      record[5] + definition.height > top
    )
      return true;
  }
  return false;
}

function conservationParcelEligible(parcelX, parcelY) {
  if (
    !farmStateBytes ||
    !saveData ||
    parcelX < 0 ||
    parcelY < 0 ||
    parcelX >= saveData.format.parcelGridWidth ||
    parcelY >= saveData.format.parcelGridHeight ||
    parcelStatus(parcelX, parcelY) !== 1 ||
    conservationContract(parcelX, parcelY)
  )
    return false;
  return (
    !parcelHasActiveField(parcelX, parcelY) &&
    !parcelHasActiveStructure(parcelX, parcelY)
  );
}

function isConservationCell(x, y) {
  if (!farmExtensionState.conservationContracts.length) return false;
  return farmExtensionState.conservationContracts.some(
    (contract) =>
      x >= contract.parcelX * 8 &&
      x < contract.parcelX * 8 + 8 &&
      y >= contract.parcelY * 8 &&
      y < contract.parcelY * 8 + 8,
  );
}

function enrollConservationParcel(parcelX, parcelY) {
  if (!conservationParcelEligible(parcelX, parcelY)) return false;
  const startYear = Math.trunc(state.year);
  if (
    !Number.isInteger(startYear) ||
    startYear < 1900 ||
    startYear + conservationTerms.termYears > 0xffff
  )
    return false;
  const contract = {
    parcelX,
    parcelY,
    startYear,
    nextPaymentYear: startYear + 1,
    endYear: startYear + conservationTerms.termYears,
    paymentsMade: 1,
  };
  farmExtensionState.conservationContracts.push(contract);
  farmExtensionState.conservationPayments += conservationTerms.annualPayment;
  state.funds += conservationTerms.annualPayment;
  message = `Conservation payment: $${conservationTerms.annualPayment}.`;
  mapDirty = true;
  return true;
}

function withdrawConservationParcel(parcelX, parcelY) {
  const index = farmExtensionState.conservationContracts.findIndex(
    (contract) => contract.parcelX === parcelX && contract.parcelY === parcelY,
  );
  if (index < 0) return false;
  farmExtensionState.conservationContracts.splice(index, 1);
  farmExtensionState.conservationWithdrawals += 1;
  mapDirty = true;
  return true;
}

function advanceConservationContracts() {
  let changed = false;
  const remaining = [];
  for (const contract of farmExtensionState.conservationContracts) {
    if (state.year >= contract.endYear) {
      changed = true;
      continue;
    }
    if (state.year >= contract.nextPaymentYear) {
      state.funds += conservationTerms.annualPayment;
      farmExtensionState.conservationPayments +=
        conservationTerms.annualPayment;
      contract.paymentsMade += 1;
      contract.nextPaymentYear += 1;
      changed = true;
    }
    remaining.push(contract);
  }
  farmExtensionState.conservationContracts = remaining;
  return changed;
}

function conservationParcelOptions() {
  const parcels = [];
  if (!farmStateBytes || !saveData) return parcels;
  for (
    let parcelX = 0;
    parcelX < saveData.format.parcelGridWidth;
    parcelX += 1
  ) {
    for (
      let parcelY = 0;
      parcelY < saveData.format.parcelGridHeight;
      parcelY += 1
    ) {
      if (parcelStatus(parcelX, parcelY) === 1)
        parcels.push({ x: parcelX, y: parcelY });
    }
  }
  return parcels;
}

function drawConservationWindow() {
  const x = 144;
  const y = 80;
  const parcels = conservationParcelOptions();
  const maxScroll = Math.max(0, parcels.length - 8);
  conservationListScroll = Math.min(conservationListScroll, maxScroll);
  context.fillStyle = "#c3c3c3";
  context.fillRect(x, y + 16, 352, 288);
  drawText("Fictional conservation cover", x + 16, y + 28);
  drawText("1 owned parcel (64 cells) | 3 years", x + 16, y + 40);
  drawText("$100 now + two year-start payments", x + 16, y + 52);
  for (let row = 0; row < 8; row += 1) {
    const parcel = parcels[conservationListScroll + row];
    if (!parcel) break;
    const rowY = y + 72 + row * 16;
    const selected =
      parcel.x === conservationSelectedParcel?.x &&
      parcel.y === conservationSelectedParcel?.y;
    if (selected) {
      context.fillStyle = "#000000";
      context.fillRect(x + 12, rowY - 1, 328, 15);
    }
    const contract = conservationContract(parcel.x, parcel.y);
    const status = contract
      ? `COVER ${contract.endYear - state.year}Y`
      : conservationParcelEligible(parcel.x, parcel.y)
        ? "ELIGIBLE"
        : "IN USE";
    drawText(
      `Parcel ${parcel.x},${parcel.y} ${status}`,
      x + 16,
      rowY + 2,
      selected ? "white" : "black",
    );
  }
  const contract = conservationSelectedParcel
    ? conservationContract(
        conservationSelectedParcel.x,
        conservationSelectedParcel.y,
      )
    : null;
  const action = contract
    ? "Withdraw"
    : conservationSelectedParcel &&
        conservationParcelEligible(
          conservationSelectedParcel.x,
          conservationSelectedParcel.y,
        )
      ? "Enroll"
      : "Select eligible parcel";
  drawText(
    `Payments: $${farmExtensionState.conservationPayments}`,
    x + 16,
    y + 208,
  );
  drawText(
    `Active contracts: ${farmExtensionState.conservationContracts.length}`,
    x + 16,
    y + 220,
  );
  drawInsuranceButton(action, x + 32, y + 232, 128);
  drawInsuranceButton("Close", x + 184, y + 232, 64);
  if (parcels.length > 8) {
    drawInsuranceButton("Prev", x + 16, y + 260, 48);
    drawInsuranceButton("Next", x + 272, y + 260, 48);
  }
}

function handleConservationClick(point) {
  const parcels = conservationParcelOptions();
  if (inside(point, 156, 152, 328, 128)) {
    const row = Math.floor((point.y - 152) / 16);
    conservationSelectedParcel = parcels[conservationListScroll + row] ?? null;
    return true;
  }
  if (inside(point, 176, 312, 128, 20)) {
    const parcel = conservationSelectedParcel;
    if (!parcel) return true;
    if (conservationContract(parcel.x, parcel.y)) {
      withdrawConservationParcel(parcel.x, parcel.y);
    } else if (!enrollConservationParcel(parcel.x, parcel.y)) {
      message = "Parcel must be owned and free of fields or buildings.";
    }
    return true;
  }
  if (inside(point, 328, 312, 64, 20)) {
    closeActiveWindow();
    return true;
  }
  if (inside(point, 160, 340, 48, 20)) {
    conservationListScroll = Math.max(0, conservationListScroll - 1);
    return true;
  }
  if (inside(point, 416, 340, 48, 20)) {
    conservationListScroll = Math.min(
      Math.max(0, parcels.length - 8),
      conservationListScroll + 1,
    );
    return true;
  }
  return true;
}

function conservationParcelValidInBytes(bytes, parcelX, parcelY) {
  const format = saveData.format;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parcelIndex = parcelX * format.parcelGridHeight + parcelY;
  const parcelOffset =
    format.parcelRecordOffset + parcelIndex * format.parcelRecordSize;
  if (bytes[parcelOffset + format.parcelStatusOffset] !== 1) return false;
  const left = parcelX * 8;
  const top = parcelY * 8;
  const right = left + 8;
  const bottom = top + 8;
  for (let slot = 1; slot < format.fieldRecordCount; slot += 1) {
    const offset = format.fieldRecordOffset + slot * format.fieldRecordSize;
    if ((bytes[offset + 7] & 1) === 0) continue;
    if (
      bytes[offset + 10] < right &&
      bytes[offset + 10] + bytes[offset + 12] > left &&
      bytes[offset + 11] < bottom &&
      bytes[offset + 11] + bytes[offset + 13] > top
    )
      return false;
  }
  for (let slot = 1; slot < format.structureRecordCount; slot += 1) {
    const offset =
      format.structureRecordOffset + slot * format.structureRecordSize;
    if ((view.getUint16(offset + 2, true) & 0x20) === 0) continue;
    const id = view.getUint16(offset, true);
    let width = 0;
    let height = 0;
    for (
      let index = 0;
      index < format.structureItemDefinitionCount;
      index += 1
    ) {
      const definitionOffset =
        format.structureItemDefinitionOffset +
        index * format.itemDefinitionRecordSize;
      if (view.getUint16(definitionOffset + 2, true) !== id) continue;
      width = bytes[definitionOffset + 8];
      height = bytes[definitionOffset + 9];
      break;
    }
    if (
      width > 0 &&
      height > 0 &&
      bytes[offset + 4] < right &&
      bytes[offset + 4] + width > left &&
      bytes[offset + 5] < bottom &&
      bytes[offset + 5] + height > top
    )
      return false;
  }
  return true;
}
