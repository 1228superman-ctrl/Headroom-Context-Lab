import { describe, expect, it, vi } from "vitest";
import {
  isMissingContentReceiver,
  withContentReceiverRecovery,
} from "./content-script-recovery";

describe("content-script recovery after extension reload", () => {
  it("recognizes missing receivers, not ordinary content or network failures", () => {
    expect(
      isMissingContentReceiver(
        new Error(
          "Could not establish connection. Receiving end does not exist.",
        ),
      ),
    ).toBe(true);
    expect(
      isMissingContentReceiver(new Error("Receiving end does not exist.")),
    ).toBe(true);
    expect(isMissingContentReceiver(new Error("No tab with id: 42"))).toBe(
      false,
    );
    expect(isMissingContentReceiver(new Error("ChatGPT network offline"))).toBe(
      false,
    );
  });
  it("reinserts exactly once then retries the original read-only message", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("Receiving end does not exist"))
      .mockResolvedValue({ ok: true });
    const restore = vi.fn().mockResolvedValue(undefined);
    expect(await withContentReceiverRecovery(send, restore)).toEqual({
      ok: true,
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(restore).toHaveBeenCalledTimes(1);
  });
  it("never retries a normal failure", async () => {
    const send = vi
      .fn()
      .mockRejectedValue(new Error("ChatGPT session expired"));
    const restore = vi.fn();
    await expect(withContentReceiverRecovery(send, restore)).rejects.toThrow(
      "ChatGPT session expired",
    );
    expect(restore).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("never loops if the second send also lacks a receiver", async () => {
    const send = vi
      .fn()
      .mockRejectedValue(new Error("Receiving end does not exist"));
    const restore = vi.fn().mockResolvedValue(undefined);
    await expect(withContentReceiverRecovery(send, restore)).rejects.toThrow(
      "Receiving end does not exist",
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});