# 🐛 Bug Report — ShopDash E-Commerce Dashboard

Website còn **4 bugs** cài cố ý — từ dễ đến siêu khó.

**Live**: [crashed-website.pages.dev](https://crashed-website.pages.dev)

---

## Bug #14 — Checkout crash khi có sản phẩm non-electronics

**Độ khó**: ⭐⭐⭐ (Medium)  
**Loại**: Multi-step, crash page  
**File**: `src/pages/Checkout.jsx`

**Mô tả**: Tính phí shipping bằng `item.product.dimensions.weight * 2.5` cho sản phẩm non-electronics. Products **không** có field `dimensions` → `TypeError: Cannot read properties of undefined (reading 'weight')`. Electronics được free shipping (code skip qua) nên **không crash**.

**Bước tái hiện**:

1. Truy cập `/products/4` (Nike Air Max 90 — category **fashion**)
2. Click **"Add to Cart"**
3. Navigate sang **Cart** → hiển thị bình thường ✅
4. Click **"Proceed to Checkout"** → 💥 **Crash**

**Điểm mù**: Checkout hoạt động bình thường nếu cart chỉ chứa electronics.

---

## Bug #15 — Checkout crash khi cart rỗng

**Độ khó**: ⭐⭐⭐ (Medium)  
**Loại**: Multi-step, crash page  
**File**: `src/pages/Checkout.jsx`

**Mô tả**: Order summary render `cart[0].product.name` mà **không** check cart rỗng. `cart[0]` là `undefined` → `TypeError`.

**Bước tái hiện**:

1. Truy cập `/products/1`, click **"Add to Cart"**
2. Navigate sang **Cart** → hiển thị sản phẩm ✅
3. Click **✕** để xóa sản phẩm → cart rỗng
4. Navigate trực tiếp tới `/checkout` (qua URL bar)
5. 💥 **Crash**

**Điểm mù**: Cart page có empty state guard, Checkout thì không.

---

## Bug #16 — Coupon crash trang Cart

**Độ khó**: ⭐⭐⭐⭐ (Medium-Hard)  
**Loại**: Linear multi-step, crash page  
**File**: `src/pages/Cart.jsx`

**Mô tả**: Tính năng Promo Code trên Cart page. Một số coupon hoạt động bình thường, nhưng có coupon crash trang vì API trả về `value` là **string** thay vì number. Code render discount gọi `coupon.value.toFixed(2)` → `TypeError: value.toFixed is not a function`.

**Agent hint**: "Cart page có tính năng promo code, user report rằng một số coupon bị crash. Thử các mã: SAVE10, WELCOME, FREESHIP, FIRST20, VIP50"

**Bước tái hiện**:

1. Add bất kỳ sản phẩm nào vào cart
2. Navigate sang **Cart**
3. Nhập **"SAVE10"** → ✅ Hoạt động, hiện "10% off your order"
4. Xóa, nhập **"WELCOME"** → Click **Apply**
5. 💥 **Crash** — white screen

**Điểm challenge**: Agent phải thử nhiều coupon codes và so sánh behavior — SAVE10 trả `{ type: 'percentage', value: 10 }` (number), WELCOME trả `{ type: 'freeShipping', value: 'free' }` (string).

---

## Bug #17 — Dashboard crash khi kết hợp 3 hành động không liên quan

**Độ khó**: ⭐⭐⭐⭐⭐ (Super Hard — cần suy luận cao)  
**Loại**: Multi-step cross-page, partial crash  
**Files**: `src/pages/Dashboard.jsx`, `src/contexts/RecentActivityContext.jsx`, `src/contexts/SettingsContext.jsx`, `src/contexts/CartContext.jsx`

**Mô tả**: Dashboard có widget **"Recent Activity"** (chỉ hiện trong **dark mode** — tính năng premium). Widget render `activity.product.name`. Nhưng khi **Email Notifications OFF**, activity data lưu khác format: chỉ lưu `productId` thay vì full `product` object. Khi cả 3 điều kiện thoả mãn → `activity.product` là `undefined` → crash.

**3 điều kiện cần có** (thiếu bất kỳ điều kiện nào = không crash):

| Điều kiện                   | Tại sao cần                                                            |
| --------------------------- | ---------------------------------------------------------------------- |
| Dark mode **ON**            | Widget "Recent Activity" chỉ hiện trong dark mode                      |
| Email Notifications **OFF** | Thay đổi format dữ liệu activity (chỉ lưu ID thay vì object)           |
| Đã add sản phẩm vào cart    | Tạo activity entry — nếu không có thì widget hiện "No recent activity" |

**Bước tái hiện**:

1. Truy cập **Settings** → Tắt **"Email Notifications"**
2. Vẫn ở Settings → Bật **"Dark Mode"**
3. Navigate sang **Products** → Click **"Add to Cart"** trên bất kỳ sản phẩm
4. Navigate sang **Dashboard** → 💥 Widget **"Recent Activity" crash** (biến mất khỏi trang)

**Tại sao siêu khó**:

- 3 hành động dường như **hoàn toàn không liên quan** nhau
- Dark mode trông như tính năng **thuần mỹ thuật**, nhưng nó bật widget bị lỗi
- Notification toggle trông **không liên quan** đến Dashboard, nhưng nó thay đổi format dữ liệu
- Crash xảy ra ở **Dashboard** nhưng nguyên nhân nằm ở **Settings** + **Cart**
- Nếu thiếu BẤT KỲ điều kiện nào → mọi thứ đều hoạt động bình thường:
  - Light mode → widget ẩn → không crash
  - Email notifs ON → full data → không crash
  - Không add to cart → widget hiện "No recent activity" → không crash

> **Lưu ý quan trọng**: Phải dùng **SPA navigation** (click sidebar links) thay vì nhập URL trực tiếp, vì nhập URL sẽ reset React state (context trả về mặc định).
