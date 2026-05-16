// ========== FIREBASE INITIALIZATION ==========
const firebaseConfig = {
    apiKey: "AIzaSyBo_nuFQIqKRhfK_xbShTUUA6ZdFgLR7Pc",
    authDomain: "yocash-37d6a.firebaseapp.com",
    projectId: "yocash-37d6a",
    storageBucket: "yocash-37d6a.firebasestorage.app",
    messagingSenderId: "806064918169",
    appId: "1:806064918169:web:86c1dff51c976622663208",
    measurementId: "G-R2PSWW9RZW"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// ========== DATA STORAGE ==========
let products = [];
let presets = {
    amounts: [{ value: "1-10", unit: "Triệu" }, { value: "5-50", unit: "Triệu" }, { value: "1-5", unit: "Tỷ" }],
    procedures: ["CCCD", "CMND", "Hộ chiếu"],
    periods: ["3 tháng", "6 tháng", "12 tháng", "24 tháng"],
    ages: ["20-60", "18-55", "21-65"],
    promotions: ["Khuyến mãi", "Ưu đãi đặc biệt", "Tặng quà"],
    discounts: ["0% lãi", "Lãi suất thấp", "Giảm 50%"]
};
let currentSelection = {};
let dragSourceIndex = null;
let urlStatusCache = {};

// ========== ANNOUNCEMENT ==========
let currentAnnouncement = null;
let currentCustomer = null;
let customersList = [];
let announcementHistory = [];
let filteredCustomersList = [];

const ADMIN_EMAIL = "admin@yocash.vn";

// ========== HELPER FUNCTIONS ==========
function getElement(id) {
    return document.getElementById(id);
}

function showToast(message, isError = false) {
    let toast = document.querySelector('.toast-message');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast-message';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = isError ? '#dc3545' : '#0f3460';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function clearSavedPassword() {
    localStorage.removeItem('admin_logged_in');
    showToast('✅ Đã xóa thông tin đăng nhập');
}

// ========== DEVICE ID ==========
function getDeviceId() {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
        deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
}

// ========== KIỂM TRA URL ==========
async function checkUrlDetails(url) {
    if (urlStatusCache[url] && Date.now() - urlStatusCache[url].timestamp < 300000) {
        return urlStatusCache[url].data;
    }
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(url, {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        let finalUrl = url;
        let redirected = false;
        
        if (response.url && response.url !== url && response.url !== '') {
            finalUrl = response.url;
            redirected = true;
        }
        
        let domain = '';
        try {
            const urlObj = new URL(finalUrl);
            domain = urlObj.hostname.replace('www.', '');
        } catch(e) {
            domain = 'Không xác định';
        }
        
        const result = {
            status: redirected ? 'redirect' : 'valid',
            message: redirected ? `Chuyển hướng → ${domain}` : 'Hoạt động',
            finalUrl: finalUrl,
            domain: domain,
            redirected: redirected
        };
        
        urlStatusCache[url] = { data: result, timestamp: Date.now() };
        return result;
        
    } catch (error) {
        let domain = '';
        try {
            const urlObj = new URL(url);
            domain = urlObj.hostname.replace('www.', '');
        } catch(e) {
            domain = 'Không xác định';
        }
        
        let status = 'invalid';
        let message = 'Không truy cập được';
        
        if (error.name === 'AbortError') {
            status = 'timeout';
            message = 'Timeout 8s';
        }
        
        const result = {
            status: status,
            message: message,
            finalUrl: url,
            domain: domain,
            redirected: false
        };
        
        urlStatusCache[url] = { data: result, timestamp: Date.now() };
        return result;
    }
}

async function checkAllUrls() {
    if (products.length === 0) return;
    
    showToast('🔄 Đang kiểm tra ' + products.length + ' link...');
    
    const checkPromises = products.map(async (product) => {
        const result = await checkUrlDetails(product.link);
        product._urlStatus = result;
        return result;
    });
    
    await Promise.all(checkPromises);
    loadProductList();
    showToast('✅ Đã kiểm tra xong ' + products.length + ' link!');
}

function recheckAllLinks() {
    urlStatusCache = {};
    checkAllUrls();
}

// ========== FIREBASE: REALTIME LISTENERS ==========

function listenProducts() {
    const productsRef = database.ref('products');
    productsRef.on('value', (snapshot) => {
        const data = snapshot.val();
        console.log('📦 Products data:', data);
        
        if (data) {
            if (Array.isArray(data)) {
                products = data.map((item, index) => ({
                    id: index.toString(),
                    ...item,
                    order: item.order || index
                }));
            } else if (typeof data === 'object') {
                const keys = Object.keys(data);
                if (keys.length > 0) {
                    products = keys.map(key => ({
                        id: key,
                        ...data[key]
                    })).sort((a, b) => (a.order || 0) - (b.order || 0));
                } else {
                    products = [];
                }
            } else {
                products = [];
            }
        } else {
            products = [];
        }
        
        localStorage.setItem('products_backup', JSON.stringify(products));
        renderUserGrid();
        
        if (document.getElementById('adminView').style.display === 'block') {
            loadProductList();
        }
    });
}

function listenAnnouncement() {
    const announcementRef = database.ref('announcements/current');
    announcementRef.on('value', (snapshot) => {
        const data = snapshot.val();
        console.log('📢 Announcement:', data);
        
        if (data && data.active === true) {
            let isExpired = false;
            if (data.expires_at) {
                const expiry = new Date(data.expires_at);
                if (expiry < new Date()) {
                    isExpired = true;
                }
            }
            
            if (!isExpired) {
                currentAnnouncement = data;
                const isAdminView = document.getElementById('adminView').style.display === 'block';
                
                if (!isAdminView) {
                    console.log('📢 Hiển thị popup thông báo cho user');
                    setTimeout(() => showAnnouncementPopup(data), 500);
                }
                
                if (isAdminView) {
                    loadAnnouncementToForm(data);
                }
            }
        } else {
            console.log('📢 Không có thông báo đang hoạt động');
        }
    });
}

function listenAnnouncementHistory() {
    const historyRef = database.ref('announcements/history');
    historyRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (Array.isArray(data)) {
                announcementHistory = data.map((item, idx) => ({ id: idx.toString(), ...item }));
            } else {
                announcementHistory = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
            }
            announcementHistory.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else {
            announcementHistory = [];
        }
        renderAnnouncementHistory();
    });
}

function listenCustomers() {
    const customersRef = database.ref('customers');
    customersRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (Array.isArray(data)) {
                customersList = data.map((item, idx) => ({ id: idx.toString(), ...item }));
            } else {
                customersList = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
            }
        } else {
            customersList = [];
        }
        
        if (document.getElementById('adminView').style.display === 'block') {
            loadCustomerList();
        }
    });
}

// ========== CRUD PRODUCTS ==========
async function addProduct(product) {
    try {
        const productsRef = database.ref('products');
        const currentData = await productsRef.once('value');
        let currentProducts = currentData.val() || [];
        
        if (!Array.isArray(currentProducts)) {
            if (typeof currentProducts === 'object') {
                currentProducts = Object.values(currentProducts);
            } else {
                currentProducts = [];
            }
        }
        
        const newProduct = {
            ...product,
            order: currentProducts.length,
            createdAt: new Date().toISOString()
        };
        
        currentProducts.push(newProduct);
        await productsRef.set(currentProducts);
        
        showToast('✅ Đã thêm sản phẩm!');
        resetForm();
    } catch (error) {
        console.error('Lỗi thêm SP:', error);
        showToast('❌ Lỗi thêm sản phẩm', true);
    }
}

async function updateProduct(index, product) {
    try {
        const productsRef = database.ref('products');
        const currentData = await productsRef.once('value');
        let currentProducts = currentData.val() || [];
        
        if (!Array.isArray(currentProducts)) {
            if (typeof currentProducts === 'object') {
                currentProducts = Object.values(currentProducts);
            } else {
                currentProducts = [];
            }
        }
        
        if (currentProducts[index]) {
            currentProducts[index] = {
                ...currentProducts[index],
                ...product,
                updatedAt: new Date().toISOString()
            };
            await productsRef.set(currentProducts);
            showToast('✅ Đã cập nhật sản phẩm!');
            resetForm();
        }
    } catch (error) {
        console.error('Lỗi cập nhật SP:', error);
        showToast('❌ Lỗi cập nhật sản phẩm', true);
    }
}

async function deleteProductFirebase(index) {
    if (!confirm('Xóa sản phẩm này?')) return;
    try {
        const productsRef = database.ref('products');
        const currentData = await productsRef.once('value');
        let currentProducts = currentData.val() || [];
        
        if (!Array.isArray(currentProducts)) {
            if (typeof currentProducts === 'object') {
                currentProducts = Object.values(currentProducts);
            } else {
                currentProducts = [];
            }
        }
        
        currentProducts.splice(index, 1);
        currentProducts.forEach((p, i) => p.order = i);
        await productsRef.set(currentProducts);
        
        showToast('✅ Đã xóa sản phẩm');
    } catch (error) {
        console.error('Lỗi xóa SP:', error);
        showToast('❌ Lỗi xóa sản phẩm', true);
    }
}

// ========== ANNOUNCEMENT MANAGEMENT ==========
async function saveAnnouncement() {
    let isActive = document.getElementById('announcementActive')?.checked || false;
    
    if (!currentAnnouncement || !currentAnnouncement.active) {
        isActive = true;
        document.getElementById('announcementActive').checked = true;
    }
    
    const newAnnouncement = {
        active: isActive,
        title: document.getElementById('announcementTitle')?.value || 'Thông báo mới',
        message: document.getElementById('announcementMessage')?.value || 'Nội dung thông báo',
        link: document.getElementById('announcementLink')?.value || '',
        link_text: document.getElementById('announcementLinkText')?.value || 'Xem chi tiết',
        created_at: new Date().toISOString().split('T')[0],
        expires_at: document.getElementById('announcementExpiry')?.value || null
    };
    
    console.log('💾 Saving announcement:', newAnnouncement);
    
    try {
        await database.ref('announcements/current').set(newAnnouncement);
        
        const historyRef = database.ref('announcements/history');
        const currentHistory = await historyRef.once('value');
        let history = currentHistory.val() || [];
        
        if (!Array.isArray(history)) {
            if (typeof history === 'object') {
                history = Object.values(history);
            } else {
                history = [];
            }
        }
        
        history.unshift(newAnnouncement);
        if (history.length > 50) history.pop();
        await historyRef.set(history);
        
        currentAnnouncement = newAnnouncement;
        
        showToast(`✅ Đã lưu thông báo! (Đang ${isActive ? 'BẬT' : 'TẮT'})`);
        renderAnnouncementHistory();
    } catch (error) {
        console.error('Lỗi lưu thông báo:', error);
        showToast('❌ Lỗi lưu thông báo', true);
    }
}

function renderAnnouncementHistory() {
    const container = document.getElementById('announcementHistoryList');
    if (!container) return;
    
    if (!announcementHistory || announcementHistory.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">📭 Chưa có thông báo nào</div>';
        return;
    }
    
    container.innerHTML = announcementHistory.map((ann, idx) => {
        const isActive = currentAnnouncement && currentAnnouncement.active === true && 
                        (currentAnnouncement.created_at === ann.created_at || 
                         JSON.stringify(currentAnnouncement) === JSON.stringify(ann));
        const isExpired = ann.expires_at && new Date(ann.expires_at) < new Date();
        
        return `
            <div class="announcement-history-item" style="background: white; border-radius: 16px; padding: 14px; margin-bottom: 12px; border-left: 4px solid ${isActive ? '#28a745' : (isExpired ? '#dc3545' : '#e94560')};">
                <div class="title" style="font-weight: 700; margin-bottom: 6px; display: flex; justify-content: space-between; flex-wrap: wrap;">
                    <span>${escapeHtml(ann.title || 'Thông báo')}</span>
                    <div style="display: flex; gap: 6px;">
                        ${ann.active === false && !isActive ? '<span style="background:#6c757d;color:white;padding:2px 8px;border-radius:20px;font-size:11px;">🔕 Đang tắt</span>' : ''}
                        ${isExpired ? '<span style="background:#dc3545;color:white;padding:2px 8px;border-radius:20px;font-size:11px;">⏰ Hết hạn</span>' : ''}
                        ${isActive ? '<span style="background:#28a745;color:white;padding:2px 8px;border-radius:20px;font-size:11px;">🔔 Đang hiển thị</span>' : ''}
                    </div>
                </div>
                <div class="message" style="font-size: 13px; color: #4a5568; margin-bottom: 8px;">${escapeHtml(ann.message)}</div>
                <div class="meta" style="font-size: 11px; color: #94a3b8; margin-bottom: 12px;">
                    📅 ${ann.created_at || 'Chưa có ngày'}
                    ${ann.expires_at ? ` | ⏰ Hết hạn: ${ann.expires_at}` : ''}
                </div>
                <div class="announcement-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button onclick="testSendAnnouncementNow(${idx})" style="background:#0f3460;color:white;border:none;padding:8px 16px;border-radius:30px;cursor:pointer;">📱 Test gửi</button>
                    <button onclick="useAnnouncement(${idx})" style="background:#17a2b8;color:white;border:none;padding:8px 16px;border-radius:30px;cursor:pointer;">📌 Sửa & Dùng</button>
                    <button onclick="toggleAnnouncementHistory()" style="background:${isActive ? '#ffc107' : '#28a745'};color:#1a1a2e;border:none;padding:8px 16px;border-radius:30px;cursor:pointer;">${isActive ? '🔕 Tắt' : '🔔 Bật'}</button>
                    <button onclick="deleteAnnouncementFirebase(${idx})" style="background:#dc3545;color:white;border:none;padding:8px 16px;border-radius:30px;cursor:pointer;">🗑️ Xóa</button>
                </div>
            </div>
        `;
    }).join('');
}

async function toggleAnnouncementHistory() {
    try {
        const announcementRef = database.ref('announcements/current');
        const currentData = await announcementRef.once('value');
        let current = currentData.val() || {};
        
        current.active = !current.active;
        await announcementRef.set(current);
        
        showToast(`✅ Đã ${current.active ? 'BẬT' : 'TẮT'} thông báo`);
        renderAnnouncementHistory();
    } catch (error) {
        showToast('❌ Lỗi thay đổi trạng thái', true);
    }
}

function testSendAnnouncementNow(index) {
    const ann = announcementHistory[index];
    if (ann) {
        showAnnouncementPopup({ ...ann, active: true });
        showToast('✅ Đã gửi test thông báo');
    }
}

function useAnnouncement(index) {
    const ann = announcementHistory[index];
    if (ann) {
        document.getElementById('announcementActive').checked = ann.active === true;
        document.getElementById('announcementTitle').value = ann.title || '';
        document.getElementById('announcementMessage').value = ann.message || '';
        document.getElementById('announcementLink').value = ann.link || '';
        document.getElementById('announcementLinkText').value = ann.link_text || 'Xem chi tiết';
        document.getElementById('announcementExpiry').value = ann.expires_at || '';
        showToast('✅ Đã tải lên form, nhấn "Lưu thông báo" để áp dụng');
        document.querySelector('[data-tab="announce"]').click();
    }
}

async function deleteAnnouncementFirebase(index) {
    if (confirm('Xóa thông báo này?')) {
        try {
            const historyRef = database.ref('announcements/history');
            const currentHistory = await historyRef.once('value');
            let history = currentHistory.val() || [];
            
            if (!Array.isArray(history)) {
                if (typeof history === 'object') {
                    history = Object.values(history);
                } else {
                    history = [];
                }
            }
            
            history.splice(index, 1);
            await historyRef.set(history);
            showToast('✅ Đã xóa thông báo');
        } catch (error) {
            showToast('❌ Lỗi xóa', true);
        }
    }
}

function showAnnouncementPopup(announcement) {
    if (!announcement || announcement.active !== true) {
        console.log('📢 Không hiển thị popup vì active = false');
        return;
    }
    
    if (announcement.expires_at) {
        const expiry = new Date(announcement.expires_at);
        if (expiry < new Date()) return;
    }
    
    console.log('📢 ĐANG HIỂN THỊ POPUP:', announcement.title);
    
    const oldPopup = document.querySelector('.announcement-popup');
    if (oldPopup) oldPopup.remove();
    
    const popup = document.createElement('div');
    popup.className = 'announcement-popup';
    popup.innerHTML = `
        <div class="announcement-overlay" onclick="this.closest('.announcement-popup').remove()"></div>
        <div class="announcement-container">
            <button class="announcement-close" onclick="this.closest('.announcement-popup').remove()">✕</button>
            <div class="announcement-icon">📢</div>
            <h3>${escapeHtml(announcement.title || 'Thông báo')}</h3>
            <p>${escapeHtml(announcement.message)}</p>
            ${announcement.link ? `<a href="${announcement.link}" target="_blank" class="announcement-btn">${escapeHtml(announcement.link_text || 'Xem chi tiết')}</a>` : ''}
            <button class="announcement-dismiss" onclick="this.closest('.announcement-popup').remove()">Đóng</button>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
        if (popup && popup.parentNode) popup.remove();
    }, 10000);
}

function loadAnnouncementToForm(announcement) {
    if (!announcement) return;
    const activeCheckbox = document.getElementById('announcementActive');
    if (activeCheckbox) activeCheckbox.checked = announcement.active === true;
    const titleInput = document.getElementById('announcementTitle');
    if (titleInput) titleInput.value = announcement.title || '';
    const messageInput = document.getElementById('announcementMessage');
    if (messageInput) messageInput.value = announcement.message || '';
    const linkInput = document.getElementById('announcementLink');
    if (linkInput) linkInput.value = announcement.link || '';
    const linkTextInput = document.getElementById('announcementLinkText');
    if (linkTextInput) linkTextInput.value = announcement.link_text || 'Xem chi tiết';
    const expiryInput = document.getElementById('announcementExpiry');
    if (expiryInput) expiryInput.value = announcement.expires_at || '';
}

// ========== CUSTOMER MANAGEMENT ==========
async function saveCustomerInfo() {
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const province = document.getElementById('customerProvince')?.value || '';
    const agree = document.getElementById('agreePrivacy')?.checked || false;
    
    if (!name || !phone) {
        alert('❌ Vui lòng nhập đầy đủ họ tên và số điện thoại');
        return;
    }
    
    if (!province) {
        alert('❌ Vui lòng chọn tỉnh/thành phố');
        return;
    }
    
    const deviceId = getDeviceId();
    const newCustomer = {
        deviceId: deviceId,
        name: name,
        phone: phone,
        province: province,
        agreePrivacy: agree,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
    };
    
    try {
        await database.ref(`customers/${deviceId}`).set(newCustomer);
        currentCustomer = newCustomer;
        localStorage.setItem(`customer_${deviceId}`, JSON.stringify(newCustomer));
        closeCustomerForm();
        showCustomerWelcome();
        showToast(`✅ Chào mừng ${name} đến từ ${province}!`);
    } catch (error) {
        console.error('Lỗi lưu KH:', error);
        showToast('❌ Lỗi lưu thông tin', true);
    }
}

async function checkExistingCustomer() {
    const deviceId = getDeviceId();
    const savedCustomer = localStorage.getItem(`customer_${deviceId}`);
    
    if (savedCustomer) {
        currentCustomer = JSON.parse(savedCustomer);
        showCustomerWelcome();
        return true;
    }
    
    try {
        const snapshot = await database.ref(`customers/${deviceId}`).once('value');
        const existing = snapshot.val();
        if (existing) {
            currentCustomer = existing;
            localStorage.setItem(`customer_${deviceId}`, JSON.stringify(existing));
            showCustomerWelcome();
            return true;
        }
    } catch (error) {
        console.error('Lỗi kiểm tra KH:', error);
    }
    return false;
}

function showCustomerWelcome() {
    if (currentCustomer && currentCustomer.name) {
        const welcomeDiv = document.getElementById('customerWelcome');
        const nameSpan = document.getElementById('customerNameDisplay');
        if (welcomeDiv && nameSpan) {
            nameSpan.textContent = `${currentCustomer.name} (${currentCustomer.province || 'khách mới'})`;
            welcomeDiv.style.display = 'block';
        }
    }
}

function showCustomerForm() {
    document.getElementById('customerFormModal').style.display = 'flex';
}

function closeCustomerForm() {
    document.getElementById('customerFormModal').style.display = 'none';
}

async function loadCustomerList() {
    const container = document.getElementById('customerList');
    const emptyState = document.getElementById('emptyCustomerState');
    const totalSpan = document.getElementById('totalCustomers');
    const statTotal = document.getElementById('statTotalCustomers');
    
    if (!container) return;
    
    updateProvinceFilter();
    
    const displayList = filteredCustomersList.length > 0 ? filteredCustomersList : customersList;
    
    if (!displayList || displayList.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        container.innerHTML = '';
        if (totalSpan) totalSpan.innerText = '0';
        if (statTotal) statTotal.innerText = '0';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    if (totalSpan) totalSpan.innerText = displayList.length;
    if (statTotal) statTotal.innerText = customersList.length;
    
    const today = new Date().toISOString().split('T')[0];
    const newToday = customersList.filter(c => c.createdAt?.split('T')[0] === today).length;
    const hasPhone = customersList.filter(c => c.phone && c.phone.trim()).length;
    
    const statNew = document.getElementById('statNewToday');
    const statPhone = document.getElementById('statHasPhone');
    if (statNew) statNew.innerText = newToday;
    if (statPhone) statPhone.innerText = hasPhone;
    
    container.innerHTML = displayList.map(c => `
        <div class="customer-item">
            <strong>${escapeHtml(c.name)}</strong>
            ${c.province ? `<span class="customer-badge">📍 ${escapeHtml(c.province)}</span>` : ''}
            <br>
            📞 ${escapeHtml(c.phone)}<br>
            🆔 ${c.deviceId?.substr(0, 12) || '...'}<br>
            📅 ${new Date(c.createdAt).toLocaleDateString('vi-VN')}<br>
            ${c.agreePrivacy ? '✅ Đã đồng ý nhận tin' : '❌ Chưa đồng ý'}
            ${c.lastSeen ? `<br>🕐 Lần cuối: ${new Date(c.lastSeen).toLocaleDateString('vi-VN')}` : ''}
        </div>
    `).join('');
}

function updateProvinceFilter() {
    const filterSelect = document.getElementById('filterProvince');
    if (!filterSelect) return;
    
    const provinces = [...new Set(customersList.map(c => c.province).filter(p => p))];
    provinces.sort();
    
    filterSelect.innerHTML = '<option value="">-- Tất cả tỉnh/thành --</option>' + 
        provinces.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
}

function filterCustomersByProvince() {
    const province = document.getElementById('filterProvince').value;
    if (!province) {
        filteredCustomersList = [];
        loadCustomerList();
        return;
    }
    filteredCustomersList = customersList.filter(c => c.province === province);
    loadCustomerList();
    showToast(`📍 Đã lọc: ${filteredCustomersList.length} khách hàng tại ${province}`);
}

function resetCustomerFilter() {
    filteredCustomersList = [];
    document.getElementById('filterProvince').value = '';
    loadCustomerList();
    showToast('✅ Đã xóa bộ lọc');
}

async function exportCustomersToCSV() {
    if (!customersList.length) {
        showToast('❌ Chưa có dữ liệu khách hàng');
        return;
    }
    
    let csvContent = "Tên,Số điện thoại,Tỉnh thành,Device ID,Ngày đăng ký,Lần cuối truy cập,Đồng ý nhận tin\n";
    customersList.forEach(c => {
        csvContent += `"${c.name}","${c.phone}","${c.province || ''}","${c.deviceId}","${c.createdAt || ''}","${c.lastSeen || ''}","${c.agreePrivacy ? 'Có' : 'Không'}"\n`;
    });
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute("download", "khach_hang_" + new Date().toISOString().split('T')[0] + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`✅ Đã export ${customersList.length} khách hàng`);
}

async function exportByProvince() {
    if (!customersList.length) {
        showToast('❌ Chưa có dữ liệu khách hàng');
        return;
    }
    
    const byProvince = {};
    customersList.forEach(c => {
        const province = c.province || 'Chưa có tỉnh';
        if (!byProvince[province]) byProvince[province] = [];
        byProvince[province].push(c);
    });
    
    let csvContent = "Tỉnh thành,Tên,Số điện thoại,Device ID,Ngày đăng ký,Đồng ý nhận tin\n";
    for (const [province, customers] of Object.entries(byProvince)) {
        customers.forEach(c => {
            csvContent += `"${province}","${c.name}","${c.phone}","${c.deviceId}","${c.createdAt || ''}","${c.agreePrivacy ? 'Có' : 'Không'}"\n`;
        });
    }
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute("download", "khach_hang_theo_tinh_" + new Date().toISOString().split('T')[0] + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`✅ Đã export ${customersList.length} khách hàng theo tỉnh`);
}

async function copyPhonesToClipboard() {
    const phones = customersList.map(c => c.phone).filter(p => p && p.trim());
    await navigator.clipboard.writeText(phones.join('\n'));
    showToast(`📋 Đã copy ${phones.length} số điện thoại`);
}

// ========== AUTHENTICATION ==========
async function loginWithEmail(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        if (userCredential.user.email === ADMIN_EMAIL) {
            localStorage.setItem('admin_logged_in', 'true');
            document.getElementById('userView').style.display = 'none';
            document.getElementById('adminView').style.display = 'block';
            loadAdminData();
            closeLogin();
            showToast('✅ Đăng nhập thành công!');
        } else {
            await auth.signOut();
            showToast('❌ Email không có quyền admin', true);
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('❌ Sai email hoặc mật khẩu', true);
        document.getElementById('loginError').style.display = 'block';
    }
}

async function logout() {
    try {
        await auth.signOut();
        localStorage.removeItem('admin_logged_in');
        document.getElementById('adminView').style.display = 'none';
        document.getElementById('userView').style.display = 'block';
        document.getElementById('adminPassword').value = '';
        document.getElementById('loginError').style.display = 'none';
        showToast('✅ Đã đăng xuất');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function checkAutoLogin() {
    const isLoggedIn = localStorage.getItem('admin_logged_in');
    if (isLoggedIn === 'true' && auth.currentUser) {
        document.getElementById('userView').style.display = 'none';
        document.getElementById('adminView').style.display = 'block';
        loadAdminData();
        return true;
    }
    return false;
}

auth.onAuthStateChanged((user) => {
    if (user && user.email === ADMIN_EMAIL) {
        localStorage.setItem('admin_logged_in', 'true');
    } else if (user) {
        auth.signOut();
    }
});

function showLogin() {
    document.getElementById('loginModal').style.display = 'flex';
}

function closeLogin() {
    document.getElementById('loginModal').style.display = 'none';
}

function checkLogin() {
    const email = document.getElementById('adminEmail')?.value || ADMIN_EMAIL;
    const password = document.getElementById('adminPassword').value;
    loginWithEmail(email, password);
}

// ========== RENDER USER GRID ==========
function renderUserGrid() {
    const grid = document.getElementById('userGrid');
    if (!grid) return;
    
    if (!products || products.length === 0) {
        grid.innerHTML = '<div style="text-align:center;padding:40px;grid-column:1/-1;">📦 Đang tải sản phẩm...</div>';
        return;
    }
    
    grid.innerHTML = products.map(p => `
        <a href="${p.link}" class="user-card" target="_blank" rel="noopener noreferrer">
            <div class="user-card-img">
                <img src="${p.image}" onerror="this.src='https://placehold.co/400x300/e2e8f0/64748b?text=No+Image'" alt="${p.name}">
                <div class="user-card-discount">⚡ ${p.discount}</div>
            </div>
            <div class="user-card-info">
                <div class="user-card-name">${escapeHtml(p.name)}</div>
                <div class="user-card-amount">${p.amount} ${p.unit}</div>
                <div class="user-card-meta">
                    <span>📋 ${p.procedure}</span>
                    <span>👤 ${p.age}</span>
                    <span>⏰ ${p.period}</span>
                </div>
                <div class="user-card-promo">🎁 ${p.promotion}</div>
                <div class="user-card-btn">Xem chi tiết →</div>
            </div>
        </a>
    `).join('');
}

function scrollToProducts() {
    document.getElementById('userGrid').scrollIntoView({ behavior: 'smooth' });
}

// ========== ADMIN PRODUCT GRID ==========
function loadProductList() {
    const grid = getElement('productGrid');
    const count = getElement('productCount');
    const emptyState = getElement('emptyState');
    
    if (!grid) return;
    
    if (count) count.textContent = products.length;
    
    if (!products || products.length === 0) {
        grid.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';
    
    grid.innerHTML = products.map((product, index) => {
        const urlStatus = product._urlStatus || { status: 'checking' };
        const statusClass = urlStatus.status === 'valid' ? 'status-valid' : 
                           (urlStatus.status === 'redirect' ? 'status-redirect' : 
                           (urlStatus.status === 'timeout' ? 'status-timeout' : 'status-invalid'));
        const statusIcon = urlStatus.status === 'valid' ? '🟢' : 
                          (urlStatus.status === 'redirect' ? '🟡' : 
                          (urlStatus.status === 'timeout' ? '🟠' : '🔴'));
        const statusText = urlStatus.status === 'valid' ? 'Hoạt động' :
                          (urlStatus.status === 'redirect' ? 'Chuyển hướng' :
                          (urlStatus.status === 'timeout' ? 'Timeout' : 'Lỗi'));
        
        return `
        <div class="grid-item" 
             draggable="true"
             data-index="${index}"
             ondragstart="onDragStart(event, ${index})"
             ondragend="onDragEnd(event)"
             ondragover="onDragOver(event)"
             ondrop="onDrop(event, ${index})">
            
            <div class="drag-handle" title="Kéo để sắp xếp">⋮⋮</div>
            
            <div class="grid-image-container">
                <img src="${product.image || ''}" alt="${product.name || ''}"
                     onerror="this.src='https://placehold.co/400x300/e2e8f0/64748b?text=No+Image'">
                <div class="discount-label">⚡ ${product.discount || ''}</div>
            </div>
            
            <div class="grid-item-info">
                <div class="grid-product-name">${escapeHtml(product.name || 'Không tên')}</div>
                
                <div class="url-status ${statusClass}" style="font-size:10px;padding:2px 8px;border-radius:20px;text-align:center;margin:4px 0;">
                    ${statusIcon} ${statusText}
                </div>
                
                <div class="grid-meta-tags">
                    <span class="grid-meta-tag">📋 ${product.procedure || ''}</span>
                    <span class="grid-meta-tag">👤 ${product.age || ''}</span>
                </div>
                
                <div class="grid-info-row">
                    <div class="grid-amount">
                        <span>Số tiền</span>
                        <span class="grid-amount-value">${product.amount || ''}</span>
                        <span class="grid-amount-unit">${product.unit || ''}</span>
                    </div>
                </div>
                
                <div class="grid-period">⏰ ${product.period || ''}</div>
                <div class="grid-discount">🎁 ${product.promotion || ''}</div>
                <div class="url-domain-full" style="font-size:10px;word-break:break-all;cursor:pointer;" onclick="window.open('${product.link}', '_blank')">🔗 ${product.link?.substring(0, 40) || ''}...</div>
                
                <div class="grid-actions">
                    <button class="grid-button edit-btn" onclick="editProduct(${index})">✏️ Sửa</button>
                    <button class="grid-button copy-btn" onclick="copyProduct(${index})">📋 Copy</button>
                    <button class="grid-button delete-btn" onclick="deleteProductFirebase(${index})">🗑️ Xóa</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function editProduct(index) {
    const product = products[index];
    if (!product) return;
    
    getElement('name').value = product.name;
    getElement('image').value = product.image;
    getElement('link').value = product.link;
    getElement('editIndex').value = index;
    
    currentSelection.amount = presets.amounts.find(a => a.value === product.amount) || presets.amounts[0];
    currentSelection.procedure = product.procedure;
    currentSelection.period = product.period;
    currentSelection.age = product.age;
    currentSelection.promotion = product.promotion;
    currentSelection.discount = product.discount;
    
    renderAllPresetBtns();
    updateSelectedDisplay();
    document.querySelector('[data-tab="add"]').click();
}

function copyProduct(index) {
    const original = products[index];
    if (!original) return;
    
    const copy = {
        ...original,
        name: original.name + " (Copy)",
        createdAt: new Date().toISOString()
    };
    delete copy.id;
    delete copy._urlStatus;
    
    addProduct(copy);
}

function saveProduct() {
    const name = getElement('name')?.value;
    const image = getElement('image')?.value;
    const link = getElement('link')?.value;
    const editIndex = getElement('editIndex')?.value;
    
    if (!name || !image || !link) {
        alert('❌ Vui lòng điền đầy đủ thông tin!');
        return;
    }
    
    const product = {
        name, image, link,
        discount: currentSelection.discount,
        amount: currentSelection.amount.value,
        unit: currentSelection.amount.unit,
        procedure: currentSelection.procedure,
        period: currentSelection.period,
        age: currentSelection.age,
        promotion: currentSelection.promotion
    };
    
    if (editIndex !== '') {
        updateProduct(parseInt(editIndex), product);
    } else {
        addProduct(product);
    }
}

function resetForm() {
    getElement('productForm')?.reset();
    const editIndexInput = getElement('editIndex');
    if (editIndexInput) editIndexInput.value = '';
    initSelection();
    renderAllPresetBtns();
}

// ========== DRAG & DROP ==========
function onDragStart(event, index) {
    dragSourceIndex = index;
    event.dataTransfer.effectAllowed = 'move';
    event.target.closest('.grid-item')?.classList.add('dragging');
}

function onDragEnd(event) {
    document.querySelectorAll('.grid-item.dragging, .drag-over').forEach(el => el.classList.remove('dragging', 'drag-over'));
    dragSourceIndex = null;
}

function onDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = event.target.closest('.grid-item');
    if (target && !target.classList.contains('drag-over')) {
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        target.classList.add('drag-over');
    }
}

async function onDrop(event, targetIndex) {
    event.preventDefault();
    if (dragSourceIndex === null || dragSourceIndex === targetIndex) {
        onDragEnd(event);
        return;
    }
    
    const movedProduct = products[dragSourceIndex];
    const newProducts = [...products];
    newProducts.splice(dragSourceIndex, 1);
    newProducts.splice(targetIndex, 0, movedProduct);
    
    newProducts.forEach((p, i) => p.order = i);
    
    try {
        await database.ref('products').set(newProducts);
        showToast('✅ Đã di chuyển sản phẩm');
    } catch (error) {
        console.error('Lỗi sắp xếp:', error);
        showToast('❌ Lỗi lưu thứ tự', true);
    }
    onDragEnd(event);
}

// ========== PRESET FUNCTIONS ==========
function loadPresets() {
    const saved = localStorage.getItem('admin_presets');
    if (saved) presets = JSON.parse(saved);
}

function initSelection() {
    currentSelection = {
        amount: presets.amounts[0],
        procedure: presets.procedures[0],
        period: presets.periods[0],
        age: presets.ages[0],
        promotion: presets.promotions[0],
        discount: presets.discounts[0]
    };
    updateSelectedDisplay();
}

function updateSelectedDisplay() {
    if (getElement('selectedAmount')) getElement('selectedAmount').innerHTML = currentSelection.amount ? `${currentSelection.amount.value} ${currentSelection.amount.unit}` : '--';
    if (getElement('selectedProcedure')) getElement('selectedProcedure').innerHTML = currentSelection.procedure || '--';
    if (getElement('selectedPeriod')) getElement('selectedPeriod').innerHTML = currentSelection.period || '--';
    if (getElement('selectedAge')) getElement('selectedAge').innerHTML = currentSelection.age || '--';
    if (getElement('selectedPromotion')) getElement('selectedPromotion').innerHTML = currentSelection.promotion || '--';
    if (getElement('selectedDiscount')) getElement('selectedDiscount').innerHTML = currentSelection.discount || '--';
}

function renderAllPresetBtns() {
    renderPresetBtns('amountPresets', presets.amounts, 'amount', p => `${p.value} ${p.unit}`);
    renderPresetBtns('procedurePresets', presets.procedures, 'procedure');
    renderPresetBtns('periodPresets', presets.periods, 'period');
    renderPresetBtns('agePresets', presets.ages, 'age');
    renderPresetBtns('promotionPresets', presets.promotions, 'promotion');
    renderPresetBtns('discountPresets', presets.discounts, 'discount');
}

function renderPresetBtns(containerId, arr, type, fmt = null) {
    const container = getElement(containerId);
    if (!container) return;
    
    container.innerHTML = arr.map((p, i) => {
        const isSelected = currentSelection[type] === p || (type === 'amount' && currentSelection.amount?.value === p.value);
        return `<button type="button" class="btn-preset ${isSelected ? 'selected' : ''}" onclick="selectPreset('${type}', ${i})">${fmt ? fmt(p) : p}</button>`;
    }).join('');
}

function selectPreset(type, index) {
    currentSelection[type] = presets[type + 's'][index];
    renderAllPresetBtns();
    updateSelectedDisplay();
}

// ========== PRESET MANAGER ==========
function openPresetManager() {
    renderPresetLists();
    getElement('presetModal').style.display = 'flex';
}

function closePresetManager() {
    getElement('presetModal').style.display = 'none';
}

function renderPresetLists() {
    renderPresetList('amountPresetList', presets.amounts, 'amount', true);
    renderPresetList('procedurePresetList', presets.procedures, 'procedure');
    renderPresetList('periodPresetList', presets.periods, 'period');
    renderPresetList('agePresetList', presets.ages, 'age');
    renderPresetList('promotionPresetList', presets.promotions, 'promotion');
    renderPresetList('discountPresetList', presets.discounts, 'discount');
}

function renderPresetList(containerId, arr, type, isAmount = false) {
    const container = getElement(containerId);
    if (!container) return;
    
    container.innerHTML = arr.map((p, i) => `
        <div class="preset-item">
            ${isAmount ? `
                <input value="${p.value}" onchange="updatePreset('${type}', ${i}, 'value', this.value)" style="width:80px;">
                <select onchange="updatePreset('${type}', ${i}, 'unit', this.value)">
                    <option ${p.unit === 'Triệu' ? 'selected' : ''}>Triệu</option>
                    <option ${p.unit === 'Tỷ' ? 'selected' : ''}>Tỷ</option>
                    <option ${p.unit === 'Ngàn' ? 'selected' : ''}>Ngàn</option>
                </select>
            ` : `
                <input value="${p}" onchange="updatePreset('${type}', ${i}, null, this.value)" style="flex:1;">
            `}
            <button class="btn-sm" style="background:#dc3545;color:white;" onclick="deletePreset('${type}', ${i})">🗑️</button>
        </div>
    `).join('');
}

function updatePreset(type, index, field, value) {
    if (type === 'amount' && field) {
        presets.amounts[index][field] = value;
    } else if (type !== 'amount') {
        presets[type + 's'][index] = value;
    }
}

function deletePreset(type, index) {
    presets[type + 's'].splice(index, 1);
    renderPresetLists();
}

function savePresets() {
    localStorage.setItem('admin_presets', JSON.stringify(presets));
    renderAllPresetBtns();
    closePresetManager();
    showToast('✅ Đã lưu mẫu!');
}

function addAmountPreset() { presets.amounts.push({ value: "Mới", unit: "Triệu" }); renderPresetLists(); }
function addProcedurePreset() { presets.procedures.push("Mới"); renderPresetLists(); }
function addPeriodPreset() { presets.periods.push("Mới"); renderPresetLists(); }
function addAgePreset() { presets.ages.push("Mới"); renderPresetLists(); }
function addPromotionPreset() { presets.promotions.push("Mới"); renderPresetLists(); }
function addDiscountPreset() { presets.discounts.push("Mới"); renderPresetLists(); }

// ========== ADMIN DATA LOAD ==========
function loadAdminData() {
    console.log('🔧 Loading admin data...');
    loadPresets();
    initSelection();
    renderAllPresetBtns();
    loadProductList();
    loadCustomerList();
    setTimeout(() => checkAllUrls(), 1000);
}

// ========== EVENTS & INITIALIZE ==========
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
        getElement(tab.dataset.tab + 'Tab').classList.add('active');
        
        if (tab.dataset.tab === 'customers') {
            loadCustomerList();
        }
        if (tab.dataset.tab === 'announce') {
            renderAnnouncementHistory();
        }
        if (tab.dataset.tab === 'manage') {
            setTimeout(() => checkAllUrls(), 500);
        }
    });
});

document.getElementById('loginModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('loginModal')) closeLogin();
});

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 App starting...');
    
    listenProducts();
    listenAnnouncement();
    listenAnnouncementHistory();
    listenCustomers();
    
    const autoLoggedIn = checkAutoLogin();
    
    const hasCustomer = await checkExistingCustomer();
    if (!hasCustomer && !autoLoggedIn) {
        setTimeout(() => showCustomerForm(), 1000);
    }
    
    if (autoLoggedIn) {
        loadAdminData();
    }
    
    console.log('✅ App ready!');
});