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
let settings = {};
let currentSelection = {};
let dragSourceIndex = null;
let urlStatusCache = {};

const ADMIN_PASSWORD = "admin123";
const GIS_URL = 'https://gist.githubusercontent.com/Datkep92/6149152b2e5b323ae6217e20c3f2dd53/raw/zalocash';

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
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// ========== LOAD DỮ LIỆU TỪ GIS ==========
async function loadProductsFromGIS() {
    try {
        const response = await fetch(GIS_URL + '?t=' + Date.now());
        if (!response.ok) throw new Error('Không thể tải');
        const data = await response.json();
        products = data.products || [];
        localStorage.setItem('products_backup', JSON.stringify(products));
    } catch (error) {
        console.error('Lỗi tải GIS:', error);
        const backup = localStorage.getItem('products_backup');
        if (backup) {
            products = JSON.parse(backup);
        } else {
            products = [{
                name: "CayVang",
                image: "https://ktkttayninh.edu.vn/wp-content/uploads/2024/07/app-vay-tien-cay-vang.jpg",
                link: "https://www.zalocash.net",
                discount: "0% lãi",
                amount: "1-10",
                unit: "Triệu",
                procedure: "CCCD",
                period: "3 tháng",
                age: "20-60",
                promotion: "Khuyến mãi"
            }];
        }
    }
    renderUserGrid();
    if (document.getElementById('adminView').style.display === 'block') {
        loadProductList();
    }
}

function renderUserGrid() {
    const grid = document.getElementById('userGrid');
    if (!grid) return;
    
    if (!products.length) {
        grid.innerHTML = '<div style="text-align:center;padding:40px;grid-column:1/-1;">📦 Đang cập nhật...</div>';
        return;
    }
    
    grid.innerHTML = products.map(p => `
        <a href="${p.link}" class="user-card" target="_blank" rel="noopener noreferrer">
            <div class="user-card-img">
                <img src="${p.image}" onerror="this.src='https://placehold.co/400x300/e2e8f0/64748b?text=No+Image'" alt="${p.name}">
                <div class="user-card-discount">⚡ ${p.discount}</div>
            </div>
            <div class="user-card-info">
                <div class="user-card-name">${p.name}</div>
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

// ========== LOGIN ==========
function showLogin() {
    document.getElementById('loginModal').style.display = 'flex';
}

function closeLogin() {
    document.getElementById('loginModal').style.display = 'none';
}

function checkLogin() {
    const pwd = document.getElementById('adminPassword').value;
    if (pwd === ADMIN_PASSWORD) {
        closeLogin();
        document.getElementById('userView').style.display = 'none';
        document.getElementById('adminView').style.display = 'block';
        loadAdminData();
    } else {
        document.getElementById('loginError').style.display = 'block';
    }
}

function logout() {
    document.getElementById('adminView').style.display = 'none';
    document.getElementById('userView').style.display = 'block';
    document.getElementById('adminPassword').value = '';
    document.getElementById('loginError').style.display = 'none';
}

// ========== LOAD ADMIN DATA ==========
function loadAdminData() {
    loadSettings();
    loadPresets();
    loadProductList();
    initSelection();
    renderAllPresetBtns();
    updateAdminStatus();
}

function loadSettings() {
    const saved = localStorage.getItem('admin_settings');
    if (saved) settings = JSON.parse(saved);
    if (getElement('apiUrl')) getElement('apiUrl').value = settings.apiUrl || '';
    if (getElement('githubToken')) getElement('githubToken').value = settings.githubToken || '';
    if (getElement('fileName')) getElement('fileName').value = settings.fileName || 'zalocash';
}

function saveSettings() {
    settings = {
        apiUrl: getElement('apiUrl').value,
        githubToken: getElement('githubToken').value,
        fileName: getElement('fileName').value
    };
    localStorage.setItem('admin_settings', JSON.stringify(settings));
    alert('✅ Đã lưu cài đặt');
    updateAdminStatus();
}

function updateAdminStatus() {
    if (getElement('totalProducts')) getElement('totalProducts').innerHTML = products.length;
    if (getElement('gistStatus')) getElement('gistStatus').innerHTML = settings.apiUrl ? '✅ Đã cài' : '❌ Chưa cài';
}

// ========== KIỂM TRA URL (CHẠY SONG SONG, KHÔNG VÒNG LẶP CHỜ) ==========

// Hàm kiểm tra 1 URL
async function checkUrlDetails(url) {
    // Kiểm tra cache trước
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

// Hàm kiểm tra TẤT CẢ URL - CHẠY SONG SONG (không vòng lặp chờ)
async function checkAllUrls() {
    if (products.length === 0) return;
    
    showToast('🔄 Đang kiểm tra ' + products.length + ' link...');
    
    // Tạo mảng các promise chạy song song
    const checkPromises = products.map(async (product) => {
        const result = await checkUrlDetails(product.link);
        product._urlStatus = result;
        return result;
    });
    
    // Chờ tất cả hoàn thành (chạy đồng thời)
    await Promise.all(checkPromises);
    
    // Cập nhật UI một lần sau khi tất cả hoàn thành
    loadProductList();
    showToast('✅ Đã kiểm tra xong ' + products.length + ' link!');
}

// Hàm kiểm tra lại toàn bộ (xóa cache)
function recheckAllLinks() {
    urlStatusCache = {};
    checkAllUrls();
}

// Hàm kiểm tra link cho 1 sản phẩm cụ thể (cập nhật UI ngay)
async function checkSingleUrl(index) {
    const product = products[index];
    if (!product) return;
    
    const result = await checkUrlDetails(product.link);
    product._urlStatus = result;
    
    // Cập nhật UI cho card đó (không reload toàn bộ)
    const card = document.querySelector(`.grid-item[data-index="${index}"]`);
    if (card) {
        const statusDiv = card.querySelector('.url-status');
        const urlDiv = card.querySelector('.url-domain-full');
        
        if (statusDiv) {
            const statusClass = result.status === 'valid' ? 'status-valid' : 
                               (result.status === 'redirect' ? 'status-redirect' : 
                               (result.status === 'timeout' ? 'status-timeout' : 'status-invalid'));
            const statusIcon = result.status === 'valid' ? '🟢' : 
                              (result.status === 'redirect' ? '🟡' : 
                              (result.status === 'timeout' ? '🟠' : '🔴'));
            const statusText = result.status === 'valid' ? 'Hoạt động' :
                              (result.status === 'redirect' ? 'Chuyển hướng' :
                              (result.status === 'timeout' ? 'Timeout' : 'Lỗi'));
            
            statusDiv.className = `url-status ${statusClass}`;
            statusDiv.innerHTML = `${statusIcon} ${statusText}`;
            statusDiv.title = `URL: ${product.link}`;
        }
        
        if (urlDiv) {
            urlDiv.innerHTML = `🔗 ${result.finalUrl || product.link}`;
            urlDiv.onclick = () => window.open(result.finalUrl || product.link, '_blank');
        }
    }
}



function recheckAllLinks() {
    urlStatusCache = {};
    checkAllUrls();
    showToast('🔄 Đang kiểm tra lại tất cả link...');
}

// ========== RENDER PRODUCT GRID (HÀM CHÍNH) ==========
function loadProductList() {
    const grid = getElement('productGrid');
    const count = getElement('productCount');
    const emptyState = getElement('emptyState');
    
    if (!grid) return;
    if (count) count.textContent = products.length;
    
    if (products.length === 0) {
        grid.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';
    
    grid.innerHTML = products.map((product, index) => {
        const urlStatus = product._urlStatus || { domain: 'Chưa kiểm tra', status: 'checking', finalUrl: product.link };
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
                <img src="${product.image}" alt="${product.name}"
                     onerror="this.src='https://placehold.co/400x300/e2e8f0/64748b?text=No+Image'">
                <div class="discount-label">⚡ ${product.discount}</div>
            </div>
            
            <div class="grid-item-info">
                <div class="grid-product-name">${product.name}</div>
                
                <div class="url-status ${statusClass}" title="URL: ${product.link}">
                    ${statusIcon} ${statusText}
                </div>
                <div class="url-domain-full" onclick="window.open('${urlStatus.finalUrl || product.link}', '_blank')">
                    🔗 ${urlStatus.finalUrl || product.link}
                </div>
                
                <div class="grid-meta-tags">
                    <span class="grid-meta-tag">📋 ${product.procedure}</span>
                    <span class="grid-meta-tag">👤 ${product.age}</span>
                </div>
                
                <div class="grid-info-row">
                    <div class="grid-amount">
                        <span>Số tiền</span>
                        <span class="grid-amount-value">${product.amount}</span>
                        <span class="grid-amount-unit">${product.unit}</span>
                    </div>
                </div>
                
                <div class="grid-period">⏰ ${product.period}</div>
                <div class="grid-discount">🎁 ${product.promotion}</div>
                
                <div class="grid-actions">
                    <button class="grid-button edit-btn" onclick="editProduct(${index})">✏️ Sửa</button>
                    <button class="grid-button copy-btn" onclick="copyProduct(${index})">📋 Copy</button>
                    <button class="grid-button delete-btn" onclick="deleteProduct(${index})">🗑️ Xóa</button>
                </div>
            </div>
        </div>`;
    }).join('');
    
    // Không tự động gọi checkAllUrls ở đây nữa
// Việc kiểm tra sẽ được gọi riêng
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
    products.splice(dragSourceIndex, 1);
    products.splice(targetIndex, 0, movedProduct);
    
    localStorage.setItem('products_backup', JSON.stringify(products));
    loadProductList();
    renderUserGrid();
    await updateGist();
    showToast('✅ Đã di chuyển và cập nhật Gist!');
    onDragEnd(event);
}

// ========== CRUD PRODUCTS ==========
function copyProduct(index) {
    const copy = JSON.parse(JSON.stringify(products[index]));
    copy.name = products[index].name + " (Copy)";
    products.splice(index + 1, 0, copy);
    saveAndRefresh();
    showToast(`✅ Đã copy: ${products[index].name}`);
}

function deleteProduct(index) {
    if (confirm(`Xóa sản phẩm "${products[index].name}"?`)) {
        products.splice(index, 1);
        saveAndRefresh();
        showToast('✅ Đã xóa sản phẩm');
    }
}

function editProduct(index) {
    const product = products[index];
    getElement('name').value = product.name;
    getElement('image').value = product.image;
    getElement('link').value = product.link;
    
    currentSelection.amount = presets.amounts.find(a => a.value === product.amount) || presets.amounts[0];
    currentSelection.procedure = product.procedure;
    currentSelection.period = product.period;
    currentSelection.age = product.age;
    currentSelection.promotion = product.promotion;
    currentSelection.discount = product.discount;
    
    renderAllPresetBtns();
    updateSelectedDisplay();
    getElement('editIndex').value = index;
    document.querySelector('[data-tab="add"]').click();
}

function saveProduct() {
    const name = getElement('name')?.value;
    const image = getElement('image')?.value;
    const link = getElement('link')?.value;
    
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
    
    const editIndex = getElement('editIndex').value;
    
    if (editIndex === '') {
        products.push(product);
    } else {
        products[editIndex] = product;
    }
    
    saveAndRefresh();
    resetForm();
}

function resetForm() {
    getElement('productForm')?.reset();
    getElement('editIndex').value = '';
    initSelection();
    renderAllPresetBtns();
}

function saveAndRefresh() {
    localStorage.setItem('products_backup', JSON.stringify(products));
    loadProductList();
    renderUserGrid();
    updateGist();
    showToast('✅ Đã lưu sản phẩm!');
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
        return `<button class="btn-preset ${isSelected ? 'selected' : ''}" onclick="selectPreset('${type}', ${i})">${fmt ? fmt(p) : p}</button>`;
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
    alert('✅ Đã lưu mẫu!');
}

function addAmountPreset() { presets.amounts.push({ value: "Mới", unit: "Triệu" }); renderPresetLists(); }
function addProcedurePreset() { presets.procedures.push("Mới"); renderPresetLists(); }
function addPeriodPreset() { presets.periods.push("Mới"); renderPresetLists(); }
function addAgePreset() { presets.ages.push("Mới"); renderPresetLists(); }
function addPromotionPreset() { presets.promotions.push("Mới"); renderPresetLists(); }
function addDiscountPreset() { presets.discounts.push("Mới"); renderPresetLists(); }

// ========== GIST SYNC ==========
function extractGistId(gistUrl) {
    if (gistUrl.includes('api.github.com/gists')) return gistUrl.split('/').pop();
    if (gistUrl.includes('gist.githubusercontent.com')) return gistUrl.split('/')[4];
    return gistUrl;
}

async function updateGist() {
    if (!settings.apiUrl || !settings.githubToken) return;
    
    try {
        const gistId = extractGistId(settings.apiUrl);
        const cleanProducts = products.map(p => {
            const { _urlStatus, ...rest } = p;
            return rest;
        });
        const data = {
            last_updated: new Date().toISOString(),
            version: "1.0",
            products: cleanProducts
        };
        
        await fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${settings.githubToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: {
                    [settings.fileName]: {
                        content: JSON.stringify(data, null, 2)
                    }
                }
            })
        });
    } catch (error) {
        console.error('Lỗi update Gist:', error);
    }
}

async function syncFromGist() {
    if (!settings.apiUrl || !settings.githubToken) {
        alert('❌ Vui lòng cài đặt API URL và Token trước!');
        return;
    }
    if (confirm('Đồng bộ từ Gist? Dữ liệu local sẽ bị thay thế!')) {
        await loadFromGist();
    }
}

async function loadFromGist() {
    try {
        const gistId = extractGistId(settings.apiUrl);
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: { 'Authorization': `token ${settings.githubToken}` }
        });
        
        if (!response.ok) throw new Error('Không thể kết nối Gist');
        
        const data = await response.json();
        const content = data.files[settings.fileName]?.content;
        
        if (content) {
            products = JSON.parse(content).products || [];
            localStorage.setItem('products_backup', JSON.stringify(products));
            loadProductList();
            renderUserGrid();
            alert(`✅ Đã đồng bộ ${products.length} sản phẩm!`);
        }
    } catch (error) {
        alert('❌ Lỗi: ' + error.message);
    }
}

async function testConnection() {
    if (!settings.apiUrl || !settings.githubToken) {
        alert('❌ Vui lòng nhập API URL và Token!');
        return;
    }
    
    try {
        const gistId = extractGistId(settings.apiUrl);
        const response = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: { 'Authorization': `token ${settings.githubToken}` }
        });
        alert(response.ok ? '✅ Kết nối thành công!' : '❌ Kết nối thất bại!');
    } catch (error) {
        alert('❌ Lỗi: ' + error.message);
    }
}

// ========== FILTER & SORT ==========
function filterProducts() {
    const searchTerm = getElement('productSearch')?.value.toLowerCase() || '';
    document.querySelectorAll('.grid-item').forEach((item, i) => {
        item.style.display = products[i]?.name.toLowerCase().includes(searchTerm) ? 'block' : 'none';
    });
}

function sortProducts() {
    const sortBy = getElement('sortProducts')?.value || 'name';
    
    switch (sortBy) {
        case 'name':
            products.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name-desc':
            products.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'amount':
            products.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
            break;
    }
    
    localStorage.setItem('products_backup', JSON.stringify(products));
    loadProductList();
    renderUserGrid();
    updateGist();
}

// ========== TAB ADMIN ==========
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
        getElement(tab.dataset.tab + 'Tab').classList.add('active');
    });
});

document.getElementById('loginModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('loginModal')) closeLogin();
});
function loadAdminData() {
    loadSettings();
    loadPresets();
    loadProductList();
    initSelection();
    renderAllPresetBtns();
    updateAdminStatus();
    
    // Tự động kiểm tra link sau khi load (chạy ngầm, không ảnh hưởng UI)
    setTimeout(() => checkAllUrls(), 500);
}
// ========== INITIALIZE ==========
loadProductsFromGIS();