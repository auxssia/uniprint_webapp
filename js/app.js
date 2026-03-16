/**
 * Print Service - Main App Logic
 */

// --- CONFIGURATION ---
const supabaseUrl = 'https://binnrakbpmpstxcijqsk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpbm5yYWticG1wc3R4Y2lqcXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjUwNTMsImV4cCI6MjA4OTAwMTA1M30.KuJHf8-YjQbaLz3ZOLqJBWMBTEjEGLrnVfYmNqBJ7jk';

// Initialize Supabase only if the script is loaded
let client = null;
if (window.supabase) {
    client = window.supabase.createClient(supabaseUrl, supabaseKey);
}

document.addEventListener('DOMContentLoaded', () => {

    // --- UPLOAD PAGE LOGIC ---
    const uploadForm = document.getElementById('uploadForm');

    if (uploadForm) {
        const fileInput = document.getElementById('fileInput');
        const uploadZone = document.getElementById('uploadZone');
        const fileSelected = document.getElementById('fileSelected');
        const fileName = document.getElementById('fileName');
        const btnRemove = document.getElementById('removeFileBtn');
        const btnUpload = document.getElementById('btnUpload');
        const statusMsg = document.getElementById('statusMsg');

        let currentFile = null;

        // Visual Drag and Drop Effects
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
            uploadZone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
        });

        ['dragenter', 'dragover'].forEach(evt => {
            uploadZone.addEventListener(evt, () => uploadZone.classList.add('dragover'));
        });

        ['dragleave', 'drop'].forEach(evt => {
            uploadZone.addEventListener(evt, () => uploadZone.classList.remove('dragover'));
        });

        uploadZone.addEventListener('drop', (e) => {
            handleFileSelect(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', function () {
            handleFileSelect(this.files);
        });

        function handleFileSelect(files) {
            if (files.length === 0) return;
            const file = files[0];

            if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                showStatus('Please upload a valid PDF document.', 'msg-error');
                return;
            }

            currentFile = file;
            fileName.textContent = file.name;
            uploadZone.classList.add('d-none');
            fileSelected.classList.add('active');
            btnUpload.disabled = false;
            hideStatus();
        }

        btnRemove.addEventListener('click', () => {
            currentFile = null;
            fileInput.value = '';
            fileSelected.classList.remove('active');
            uploadZone.classList.remove('d-none');
            btnUpload.disabled = true;
        });

        // --- PRICE CALCULATION LOGIC ---
        const colorModes = document.querySelectorAll('input[name="colorMode"]');
        const copiesInput = document.getElementById('copies');
        const totalPriceEl = document.getElementById('totalPrice');
        
        const PRICE_BW = 2;
        const PRICE_COLOR = 5;

        function updatePrice() {
            if (!copiesInput || !totalPriceEl) return;
            const copies = parseInt(copiesInput.value) || 1;
            const selectedColor = document.querySelector('input[name="colorMode"]:checked').value;
            const pricePerPage = selectedColor === 'color' ? PRICE_COLOR : PRICE_BW;
            const total = copies * pricePerPage;
            totalPriceEl.textContent = `₹${total}`;
        }

        // Attach listeners for live update
        if (copiesInput) copiesInput.addEventListener('input', updatePrice);
        if (colorModes) colorModes.forEach(radio => radio.addEventListener('change', updatePrice));

        // Form Submit
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentFile) return;

            setLoading(true);
            hideStatus();

            try {
                const copies = parseInt(document.getElementById('copies').value) || 1;
                const colorMode = document.querySelector('input[name="colorMode"]:checked').value;
                const doubleSided = document.getElementById('doubleSided').checked;

                // 1. Upload to Supabase Storage
                const fileExt = currentFile.name.split('.').pop();
                const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
                const filePath = `print_jobs/${safeName}`;

                const { data: uploadData, error: uploadError } = await client.storage
                    .from('documents')
                    .upload(filePath, currentFile);

                if (uploadError) throw uploadError;

                // 2. Get Public URL
                const { data: urlData } = client.storage
                    .from('documents')
                    .getPublicUrl(filePath);

                const fileUrl = urlData.publicUrl;
                console.log('File successfully uploaded:', fileUrl);

                // 3. Store the order data for the payment page
                const orderData = {
                    file_url: fileUrl,
                    copies: copies,
                    color: colorMode,
                    double_sided: doubleSided,
                    total_price: document.getElementById('totalPrice').textContent,
                    file_name: currentFile.name
                };
                sessionStorage.setItem('pendingOrder', JSON.stringify(orderData));

                // 4. Redirect to payment.html
                window.location.href = 'payment.html';

            } catch (err) {
                console.error("Upload Error:", err);
                showStatus('Order failed: ' + err.message, 'msg-error');
                setLoading(false);
            }
        });

        function setLoading(isLoading) {
            btnUpload.disabled = isLoading;
            const text = btnUpload.querySelector('.btn-text');
            const spinner = btnUpload.querySelector('.spinner');

            if (isLoading) {
                text.textContent = 'Uploading...';
                spinner.classList.remove('d-none');
            } else {
                text.textContent = 'Upload Request';
                spinner.classList.add('d-none');
            }
        }

        function showStatus(text, typeClass) {
            statusMsg.textContent = text;
            statusMsg.className = `status-msg show ${typeClass}`;
        }

        function hideStatus() {
            statusMsg.className = 'status-msg';
        }
    }

    // --- ORDERS PAGE LOGIC ---
    const ordersListEl = document.getElementById('ordersList');
    
    if (ordersListEl) {
        const loadingEl = document.getElementById('ordersLoading');
        const emptyEl = document.getElementById('ordersEmpty');

        // Initial fetch
        fetchOrders();

        // Set up Realtime Subscription
        if (client) {
            client
                .channel("orders_realtime")
                .on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: "orders"
                    },
                    (payload) => {
                        console.log("Realtime update received:", payload);
                        fetchOrders();
                    }
                )
                .subscribe();
        }

        async function fetchOrders() {
            if (!client) {
                // Handle fallback if running without Supabase
                loadingEl.style.display = 'none';
                emptyEl.style.display = 'block';
                return;
            }

            try {
                const { data, error } = await client
                    .from("orders")
                    .select("*")
                    .order("created_at", { ascending: false });

                if (error) throw error;

                // Hide Loading State
                loadingEl.style.display = 'none';

                if (!data || data.length === 0) {
                    emptyEl.style.display = 'block';
                    ordersListEl.style.display = 'none';
                    return;
                }

                // Render List
                emptyEl.style.display = 'none';
                ordersListEl.style.display = 'flex';
                ordersListEl.innerHTML = ''; // Clear previous

                data.forEach(order => {
                    const card = createOrderCard(order);
                    ordersListEl.appendChild(card);
                });

            } catch (err) {
                console.error("Failed to fetch orders:", err);
                loadingEl.innerHTML = `<p style="color: var(--error-color);">Failed to load orders.</p>`;
            }
        }

        function createOrderCard(order) {
            // Determine styling based on status
            const statusMap = {
                'pending': { label: 'Pending', cssClass: 'status-pending' },
                'printing': { label: 'Printing', cssClass: 'status-printing' },
                'ready': { label: 'Ready', cssClass: 'status-ready' }
            };

            const statusObj = statusMap[order.status] || statusMap['pending'];
            const colorOption = order.color === 'color' ? 'Color' : 'Black & White';
            const sidedOption = order.double_sided ? 'Double-sided' : 'Single-sided';
            const shortId = order.id ? order.id.toString().substring(0, 8) : '0000';
            
            // Format time nicely
            let timeStr = '';
            if (order.created_at) {
                const date = new Date(order.created_at);
                timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }

            const div = document.createElement('div');
            div.className = 'order-item';
            div.innerHTML = `
                <div class="order-info">
                    <h3 style="margin-bottom: 0.25rem;">Order #${shortId}</h3>
                    <div class="order-meta">
                        ${order.copies} ${order.copies > 1 ? 'Copies' : 'Copy'} • ${colorOption} • ${sidedOption}
                    </div>
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">
                        ${timeStr}
                    </div>
                </div>
                <div class="status-badge ${statusObj.cssClass}">${statusObj.label}</div>
            `;
            return div;
        }
    }

    // --- PAYMENT PAGE LOGIC ---
    const paymentSummaryEl = document.getElementById('paymentSummary');
    
    if (paymentSummaryEl) {
        const orderDataRaw = sessionStorage.getItem('pendingOrder');
        if (!orderDataRaw) {
            // No order to pay for, redirect home
            window.location.href = 'index.html';
            return;
        }

        const orderData = JSON.parse(orderDataRaw);
        
        // Populate specific UI tags
        document.getElementById('payDocName').textContent = orderData.file_name || 'Document.pdf';
        document.getElementById('payCopies').textContent = orderData.copies;
        document.getElementById('payColor').textContent = orderData.color === 'color' ? 'Full Color' : 'Black & White';
        document.getElementById('payFormat').textContent = orderData.double_sided ? 'Double-sided' : 'Single-sided';
        document.getElementById('payTotal').textContent = orderData.total_price;

        // Payment Event handling
        const fakePayBtn = document.getElementById('fakePayBtn');
        const payBtnText = document.getElementById('payBtnText');
        const paySpinner = document.getElementById('paySpinner');
        const paymentStatus = document.getElementById('paymentStatus');

        fakePayBtn.addEventListener('click', async () => {
            // Spin down state
            fakePayBtn.disabled = true;
            payBtnText.textContent = 'Processing...';
            paySpinner.classList.remove('d-none');
            
            // Artificial delay to mimic bank validation
            await new Promise(r => setTimeout(r, 1200));

            try {
                // If demo credentials are being used
                if (supabaseUrl.includes('binnrakbpmpstxcijqsk')) {
                    const { data, error } = await client
                        .from('orders')
                        .insert([{
                            file_url: orderData.file_url,
                            copies: orderData.copies,
                            color: orderData.color,
                            double_sided: orderData.double_sided,
                            status: 'pending',
                            payment_status: 'paid'
                        }]);

                    if (error) throw error;
                }

                // Clean session & Forward
                sessionStorage.removeItem('pendingOrder');
                window.location.href = 'payment-success.html';

            } catch (err) {
                console.error("Payment error:", err);
                paymentStatus.textContent = 'Transaction failed: ' + err.message;
                paymentStatus.classList.add('show', 'msg-error');
                
                // Revert to active click state
                fakePayBtn.disabled = false;
                payBtnText.textContent = 'I definitely paid. Trust me.';
                paySpinner.classList.add('d-none');
            }
        });
    }
});
