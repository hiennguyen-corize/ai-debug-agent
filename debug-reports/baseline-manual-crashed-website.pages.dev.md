# Baseline Investigation Report (Manual Debug)

- **URL**: https://crashed-website.pages.dev
- **Hint**: Cart page có tính năng promo code, user report rằng một số coupon bị crash trang. Thử các mã: SAVE10, WELCOME, FREESHIP, FIRST20, VIP50
- **Investigator**: Antigravity (manual browser debug)
- **Date**: 2026-03-06T13:38:00+07:00

---

## Findings

| #   | Code         | Severity    | Status           | Behavior                                                                                                                             |
| --- | ------------ | ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **SAVE10**   | 🔴 Critical | Calculation Bug  | Discount line "10% off your order" appears in Order Summary, but **Total stays $2698.92** — discount value NOT deducted from total   |
| 2   | **WELCOME**  | 🔴 Critical | **CRASH (WSOD)** | Applying this code triggers a **White Screen of Death** — entire page content unmounts, DOM becomes empty, requires full page reload |
| 3   | **FREESHIP** | 🟡 Medium   | Invalid Code     | Shows "Invalid coupon code" — API endpoint `/api/coupon/validate` returns **404 Not Found**                                          |
| 4   | **FIRST20**  | 🟡 Medium   | Invalid Code     | Shows "Invalid coupon code" — same 404 from `/api/coupon/validate`                                                                   |
| 5   | **VIP50**    | 🟡 Medium   | Invalid Code     | Shows "Invalid coupon code" — same 404 from `/api/coupon/validate`                                                                   |

## Detailed Analysis

### Bug 1: SAVE10 — Discount Calculation Error

- **Steps to reproduce:**
  1. Navigate to /products
  2. Add MacBook Pro 16" ($2,499) to cart
  3. Go to Cart page
  4. Enter `SAVE10` in Promo Code field → Click Apply
- **Expected:** Total = $2,499 + $199.92 (tax) - $249.90 (10% discount) = **$2,449.02**
- **Actual:** Order Summary shows:
  - Subtotal: $2,499
  - Shipping: Free
  - Discount (10% off your order): -10%
  - Tax (8%): $199.92
  - **Total: $2,698.92** (unchanged — discount not applied to calculation)
- **Root cause (likely):** Frontend displays discount line but math logic doesn't subtract discount from subtotal when computing total.

### Bug 2: WELCOME — White Screen of Death

- **Steps to reproduce:**
  1. Add any product to cart
  2. Go to Cart page
  3. Enter `WELCOME` in Promo Code field → Click Apply
- **Expected:** Discount applied or error shown
- **Actual:** Entire page goes blank (White Screen of Death). DOM is cleared. No content visible. Must reload page.
- **Console:** No clear error captured before crash — suggests React error boundary failure, null pointer on undefined property, or infinite re-render loop.
- **Root cause (likely):** `WELCOME` coupon returns a response format the frontend doesn't handle — likely `null` or unexpected type for discount value, causing a fatal JS exception that crashes the React component tree.

### Bug 3: FREESHIP / FIRST20 / VIP50 — API 404

- **Steps to reproduce:**
  1. Add any product to cart
  2. Go to Cart page
  3. Enter any of `FREESHIP`, `FIRST20`, `VIP50` → Click Apply
- **Expected:** Valid discount applied
- **Actual:** UI shows "Invalid coupon code" in red text
- **Console:** `GET /api/coupon/validate?code=FREESHIP` → **404 Not Found**
- **Root cause:** Backend API endpoint not configured for these codes, or validation route missing entirely for non-percentage discount types (e.g., free shipping, fixed amount).

## Environment

- **Browser:** Chromium (Playwright)
- **Page title:** ShopDash — E-Commerce Dashboard
- **Version:** v1.0.0 (shown in sidebar footer)
- **Product tested:** MacBook Pro 16" — $2,499

## Summary

3 distinct bugs found across 5 promo codes:

1. **Calculation bug** (SAVE10) — discount displayed but not deducted
2. **Fatal crash** (WELCOME) — White Screen of Death
3. **Missing API** (FREESHIP, FIRST20, VIP50) — 404 on validation endpoint

**Recommendation:** Fix priority: WELCOME (crash) > SAVE10 (wrong total) > API routes (missing endpoints).
