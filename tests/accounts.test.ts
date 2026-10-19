import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { companyOf, hasCompany } from "../src/lib/rbac";
import { isValidEmail } from "../src/lib/utils";

describe("Account emails", () => {
  test("accepts real addresses", () => {
    for (const e of ["sales@trtnobox.com", "ada.eze+nobox@gmail.com", "k@sub.trtnobox.com.ng"]) assert.equal(isValidEmail(e), true, e);
  });

  test("rejects anything that cannot receive mail", () => {
    for (const e of ["", "sales", "sales@", "@trtnobox.com", "a@b", "a@b.", "a b@trtnobox.com", "a@@trtnobox.com", "a@.com"]) {
      assert.equal(isValidEmail(e), false, e);
    }
  });
});

describe("Account companies", () => {
  test("Designers and Sales choose one; managers belong to their side; administrators to none", () => {
    assert.equal(hasCompany("SALES"), true);
    assert.equal(hasCompany("NOBOX_MANAGER"), false);
    assert.equal(companyOf("SALES", "GERMANA"), "GERMANA");
    assert.equal(companyOf("DESIGNER", null), null);
    assert.equal(companyOf("NOBOX_MANAGER", null), "NOBOX");
    assert.equal(companyOf("ADMIN", "NOBOX"), null);
  });
});
