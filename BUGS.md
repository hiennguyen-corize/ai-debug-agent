# 🐛 Bug Report — ShopDash E-Commerce Dashboard

Tổng cộng **15 bugs** được cài cố ý trong ứng dụng, chia thành 2 nhóm:

- **Bugs #1–#12**: Bugs đơn giản, có thể phát hiện ngay hoặc chỉ cần 1 thao tác
- **Bugs #13–#15**: Bugs phức tạp, cần thao tác qua nhiều trang mới trigger được crash

---

## Nhóm 1: Bugs Đơn Giản (#1–#12)

### Bug #1 — TypeError crash khi mở trang Product List
- **File**: `src/pages/ProductList.jsx`
- **Mô tả**: `useState(null)` khởi tạo `products` là `null`. Component gọi `products.map()` ngay trong lần render đầu tiên, trước khi `useEffect` fetch xong dữ liệu → `TypeError: Cannot read properties of null (reading 'map')` → white screen.
- **Triệu chứng**: Truy cập `/products` → trang trắng ngay lập tức.

### Bug #2 — API trả 500 ngẫu nhiên 30%
- **File**: `server.js`
- **Mô tả**: Endpoint `GET /api/products` có `Math.random() < 0.3` → 30% request trả về HTTP 500 `"Internal Server Error"`. Response delay cũng random 200–2000ms.
- **Triệu chứng**: Gọi API products đôi khi fail không rõ lý do, không ổn định.

### Bug #3 — Search không debounce, không cancel request cũ
- **File**: `src/pages/ProductList.jsx`
- **Mô tả**: Mỗi keystroke trong ô search gọi `fetch()` mới mà **không** dùng `AbortController` để cancel request cũ, cũng **không** debounce. Kết hợp với API delay random (bug #2) → response cũ có thể đến sau response mới → hiển thị kết quả sai.
- **Triệu chứng**: Gõ nhanh trong search → kết quả nhảy lung tung, race condition.

### Bug #4 — Nút Add to Cart không disable khi đang gọi API
- **File**: `src/contexts/CartContext.jsx`
- **Mô tả**: `addToCart()` không có loading state, nút không disable khi đang chờ API response. Click nhanh 2 lần → gọi API 2 lần → thêm sản phẩm 2 lần vào cart.
- **Triệu chứng**: Double-click "Add to Cart" → quantity tăng gấp đôi.

### Bug #5 — Checkout form submit không gọi API
- **File**: `src/pages/Checkout.jsx`
- **Mô tả**: `handleSubmit` có `e.preventDefault()` nhưng chỉ `console.log()` dữ liệu form. **Không** gọi `POST /api/checkout`, không hiển thị thông báo thành công/thất bại, không clear cart, không redirect.
- **Triệu chứng**: Nhấn "Place Order" → không có gì xảy ra trên UI. Chỉ thấy log trong DevTools Console.

### Bug #6 — Dashboard spinner quay mãi khi API fail
- **File**: `src/pages/Dashboard.jsx`
- **Mô tả**: Fetch `/api/stats` (50% fail). Trong `catch` block chỉ có `console.error()`, **không** gọi `setLoading(false)` → spinner "Loading dashboard..." hiển thị vĩnh viễn.
- **Triệu chứng**: Truy cập Dashboard → 50% cơ hội thấy spinner quay mãi không dừng.

### Bug #7 — Nút "Back to Products" gây mất state
- **File**: `src/pages/ProductDetail.jsx`
- **Mô tả**: Link "← Back to Products" dùng `window.location.href = '/products'` thay vì `useNavigate()` của React Router → full page reload → mất toàn bộ React state (cart, theme, etc.).
- **Triệu chứng**: Thêm sản phẩm vào cart → click "Back to Products" → cart count reset về 0.

### Bug #8 — Validation errors bị ẩn bởi CSS overflow
- **File**: `src/index.css` (class `.profile-form-container`)
- **Mô tả**: Container form profile có `overflow: hidden` + `max-height: 400px`. Khi form có nhiều validation errors, các error messages bị cắt/ẩn bởi `overflow: hidden`.
- **Triệu chứng**: Submit profile form với dữ liệu sai → error messages không thấy đâu.

### Bug #9 — React warning do dangerouslySetInnerHTML
- **File**: `src/pages/ProductDetail.jsx` + `server.js`
- **Mô tả**: Product description từ API chứa `<p>` nested trong `<p>` (invalid HTML). Component render bằng `dangerouslySetInnerHTML` bên trong thẻ `<p>` → React cảnh báo hydration/DOM nesting trong console.
- **Triệu chứng**: Mở DevTools Console ở trang Product Detail → warning về invalid DOM nesting.

### Bug #10 — Avatar upload: không check file size, error message chung chung
- **File**: `src/pages/Profile.jsx`
- **Mô tả**: UI không validate kích thước file trước khi upload. Server reject file > 1MB với HTTP 413. Nhưng `catch` block chỉ hiển thị `"Upload failed"` — không nói lý do (file quá lớn).
- **Triệu chứng**: Upload ảnh avatar > 1MB → hiện "Upload failed" mà không giải thích vì sao.

### Bug #11 — Dark mode flash khi load trang
- **File**: `src/contexts/ThemeContext.jsx`
- **Mô tả**: `localStorage.getItem('theme')` được đọc trực tiếp trong `useState` initializer. Khi trang load, React render lần đầu với giá trị từ localStorage nhưng DOM chưa cập nhật → flash trắng rồi mới chuyển sang dark mode.
- **Triệu chứng**: Bật dark mode → refresh trang → thấy flash trắng rồi mới tối.

### Bug #12 — WebSocket connection leak
- **File**: `src/pages/ProductList.jsx`
- **Mô tả**: `useEffect` tạo `new WebSocket('ws://localhost:3001/ws')` nhưng **không** return cleanup function để đóng connection. Mỗi lần navigate tới Products page → mở thêm 1 WebSocket connection mà không đóng connection cũ.
- **Triệu chứng**: Navigate giữa các trang nhiều lần → WebSocket connections tích tụ (xem trong DevTools Network tab).

---

## Nhóm 2: Bugs Cần Tái Hiện Phức Tạp (#13–#15)

> Những bugs này cần **thao tác qua nhiều trang** mới trigger được crash — phù hợp để test AI debug agents.

### Bug #13 — Cart crash khi sản phẩm có quantity ≥ 2
- **File**: `src/pages/Cart.jsx`
- **Mô tả**: Cart component hiển thị badge "bulk discount" khi `item.quantity > 1`, truy cập `item.product.discount.percentage`. Nhưng API **không** trả về field `discount` trong product data → `TypeError: Cannot read properties of undefined (reading 'percentage')`.
- **Bước tái hiện**:
  1. Truy cập `/products/1` (MacBook Pro)
  2. Click **"Add to Cart"**
  3. Click **"Add to Cart"** lần nữa (bug #4 cho phép double-click)
  4. Navigate sang **Cart** → 💥 **White screen crash**
- **Điểm mù**: Cart hoạt động bình thường nếu mỗi sản phẩm chỉ có quantity = 1. Crash **chỉ xảy ra** khi quantity ≥ 2.

### Bug #14 — Checkout crash chỉ với sản phẩm non-electronics
- **File**: `src/pages/Checkout.jsx`
- **Mô tả**: Tính phí shipping bằng `item.product.dimensions.weight * 2.5` cho sản phẩm non-electronics. Products **không** có field `dimensions` → `TypeError: Cannot read properties of undefined (reading 'weight')`. Electronics được free shipping (code skip qua) nên **không crash**.
- **Bước tái hiện**:
  1. Truy cập `/products/4` (Nike shoes — category **fashion**)
  2. Click **"Add to Cart"**
  3. Navigate sang **Cart** → hiển thị bình thường ✅
  4. Click **"Proceed to Checkout"** → 💥 **Crash**
- **Điểm mù**: Checkout hoạt động bình thường nếu cart chỉ chứa sản phẩm electronics. Agent cần test với nhiều category khác nhau mới phát hiện.

### Bug #15 — Checkout crash khi cart rỗng
- **File**: `src/pages/Checkout.jsx`
- **Mô tả**: Order summary header render `cart[0].product.name` mà **không** check cart có rỗng không. Khi cart empty → `cart[0]` là `undefined` → `TypeError: Cannot read properties of undefined (reading 'product')`.
- **Bước tái hiện**:
  1. Truy cập `/products/1`, click **"Add to Cart"**
  2. Navigate sang **Cart** → hiển thị sản phẩm ✅
  3. Click **✕** để xóa sản phẩm → cart rỗng
  4. Navigate trực tiếp tới `/checkout` (qua URL bar)
  5. 💥 **Crash**
- **Điểm mù**: Cart page có guard `cart.length === 0` nên hiển thị empty state đúng. Nhưng Checkout page **không** có guard tương tự.

---

## Tổng Quan Theo File

| File | Bugs |
|------|------|
| `src/pages/ProductList.jsx` | #1, #3, #4, #12 |
| `src/pages/ProductDetail.jsx` | #7, #9 |
| `src/pages/Dashboard.jsx` | #6 |
| `src/pages/Cart.jsx` | #13 |
| `src/pages/Checkout.jsx` | #5, #14, #15 |
| `src/pages/Profile.jsx` | #8, #10 |
| `src/contexts/CartContext.jsx` | #4 |
| `src/contexts/ThemeContext.jsx` | #11 |
| `src/index.css` | #8 |
| `server.js` | #2, #9 |
