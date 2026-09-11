/**
 * COMMON JAVASCRIPT MODULE
 * Shared Utilities, API Base, Toast, Navigation & Admin Auth
 */

const API_BASE = 'http://localhost:8080/api';

// Shared Global State
const sharedState = {
  isAdminLoggedIn: false,
  adminUser: null
};

// --- Toast Notifications ---
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'inodino-toast-box';
    document.body.appendChild(toastContainer);
  }
  
  const toast = document.createElement('div');
  toast.className = `inodino-toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// --- Date / Time Formatting Helpers ---
function formatDateTime(dtStr) {
  if (!dtStr) return '-';
  const d = new Date(dtStr);
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(dtStr) {
  if (!dtStr) return '-';
  const d = new Date(dtStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function toLocalISOString(date) {
  const pad = (n) => (n < 10 ? '0' + n : n);
  return date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + 'T' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes());
}

// --- Stop All MediaStreams Helper (Releasing RAM & Camera Hardware) ---
function stopAllMediaStreams() {
  document.querySelectorAll('video').forEach(video => {
    if (video.srcObject && typeof video.srcObject.getTracks === 'function') {
      video.srcObject.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }
  });
}

// --- Admin Authentication & Session ---
function checkAdminLoginStatus() {
  const adminUser = localStorage.getItem('adminUser');
  if (adminUser) {
    try {
      sharedState.isAdminLoggedIn = true;
      sharedState.adminUser = JSON.parse(adminUser);
      renderLogoutButton();
    } catch (e) {
      localStorage.removeItem('adminUser');
    }
  }
}

function renderLogoutButton() {
  const statusBox = document.querySelector('.header-status-box');
  if (!statusBox || document.getElementById('admin-logout-btn')) return;
  
  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'admin-logout-btn';
  logoutBtn.className = 'inodino-btn inodino-btn-danger inodino-btn-sm admin-logout-btn';
  logoutBtn.style.marginLeft = '12px';
  logoutBtn.innerHTML = '<span>🔒</span> Đăng xuất';
  logoutBtn.addEventListener('click', handleAdminLogout);
  statusBox.appendChild(logoutBtn);
}

function handleAdminLogout() {
  if (confirm('Bạn có chắc muốn đăng xuất tài khoản quản trị?')) {
    localStorage.removeItem('adminUser');
    sharedState.isAdminLoggedIn = false;
    sharedState.adminUser = null;
    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) logoutBtn.remove();
    showToast('Đã đăng xuất tài khoản quản trị', 'info');
    if (window.location.pathname.endsWith('admin.html')) {
      window.location.href = 'index.html';
    }
  }
}

window.openLoginModal = function() {
  const loginModal = document.getElementById('login-modal');
  if (loginModal) {
    const uInput = document.getElementById('login-username');
    const pInput = document.getElementById('login-password');
    const err = document.getElementById('login-error-msg');
    if (uInput) uInput.value = '';
    if (pInput) pInput.value = '';
    if (err) err.style.display = 'none';
    loginModal.classList.add('active');
  }
};

window.closeLoginModal = function() {
  const loginModal = document.getElementById('login-modal');
  if (loginModal) {
    loginModal.classList.remove('active');
  }
};

// Setup Admin Tab / Login Interceptor
function setupGlobalNav() {
  const adminTabBtn = document.querySelector('.admin-tab');
  if (adminTabBtn) {
    adminTabBtn.addEventListener('click', (e) => {
      const adminUser = localStorage.getItem('adminUser');
      if (!adminUser) {
        e.preventDefault();
        window.openLoginModal();
      }
    });
  }

  // Setup Login Form submit
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usernameInput = document.getElementById('login-username').value.trim();
      const passwordInput = document.getElementById('login-password').value.trim();
      const errorMsg = document.getElementById('login-error-msg');
      
      try {
        const response = await fetch(`${API_BASE}/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
          localStorage.setItem('adminUser', JSON.stringify(result.data));
          sharedState.isAdminLoggedIn = true;
          sharedState.adminUser = result.data;
          
          window.closeLoginModal();
          showToast(`Xin chào ${result.data.fullName}! Đăng nhập thành công.`, 'success');
          
          setTimeout(() => {
            window.location.href = 'admin.html';
          }, 400);
        } else {
          if (errorMsg) {
            errorMsg.innerText = result.message || 'Tài khoản hoặc mật khẩu không đúng';
            errorMsg.style.display = 'block';
          }
        }
      } catch (err) {
        if (errorMsg) {
          errorMsg.innerText = 'Lỗi kết nối máy chủ backend';
          errorMsg.style.display = 'block';
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkAdminLoginStatus();
  setupGlobalNav();
});
