/* ==========================================================
   Cofe Dawn — shared script
   Runs on every page; each section only activates when the
   page contains the element ids it needs.
   ========================================================== */

var ORDER_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyU-Dr-t8uD4dKtkr-rjg5O-L2mdF-x8vz0vBeYVpYp2cKpLdQUikt7DA45pVI--6aNJQ/exec';
var ORDERS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRQINKjF6dWCNCnybvYPvz-0ylrXPQ1XUq1FgvRLSVn0ljQ-SQgmvvcOXTw4oOfz4uhHjr4HH1uveSa/pub?gid=0&single=true&output=csv';

document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('product-list')) initProductPage();
  if (document.getElementById('orderForm')) initOrderPage();
  if (document.querySelector('#ordersTable tbody')) initAdminPage();
});

/* ---------- Small helpers ---------- */

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatPrice(value) {
  var n = Number(value);
  return isNaN(n) ? String(value) : n.toLocaleString('th-TH');
}

/* ==========================================================
   1) product.html — product cards + Blend filter
   Needs: #filter-bar, #product-list
   ========================================================== */

function initProductPage() {
  var list = document.getElementById('product-list');
  var bar = document.getElementById('filter-bar');

  fetch('products.json')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (products) {
      // Filter buttons come from the data itself, so they always match the Blend values
      var blends = [];
      products.forEach(function (p) {
        if (blends.indexOf(p.Blend) === -1) blends.push(p.Blend);
      });

      // ?Blend=xxx (case-insensitive); unknown value falls back to "all"
      var wanted = (new URLSearchParams(window.location.search).get('Blend') || '').trim().toLowerCase();
      var initial = 'all';
      blends.forEach(function (b) {
        if (b.toLowerCase() === wanted) initial = b;
      });

      function render(blend) {
        list.textContent = '';
        var shown = products.filter(function (p) {
          return blend === 'all' || p.Blend === blend;
        });
        shown.forEach(function (p) { list.appendChild(buildProductCard(p)); });
        if (!shown.length) list.appendChild(el('p', 'muted', 'ยังไม่มีสินค้าในหมวดนี้'));

        if (bar) {
          Array.prototype.forEach.call(bar.querySelectorAll('.chip'), function (btn) {
            var active = btn.dataset.blend === blend;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
          });
        }
      }

      if (bar) {
        bar.textContent = '';
        [{ label: 'ทั้งหมด', value: 'all' }]
          .concat(blends.map(function (b) { return { label: b, value: b }; }))
          .forEach(function (item) {
            var btn = el('button', 'chip', item.label);
            btn.type = 'button';
            btn.dataset.blend = item.value;
            btn.addEventListener('click', function () { render(item.value); });
            bar.appendChild(btn);
          });
      }

      render(initial);
    })
    .catch(function (error) {
      console.error(error);
      list.textContent = '';
      list.appendChild(el('p', 'muted', 'โหลดรายการสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'));
    });
}

function buildProductCard(p) {
  var itemName = p.name + ' ' + p.size;
  var href = 'order.html?item=' + encodeURIComponent(itemName) +
             '&price=' + encodeURIComponent(p.price);

  var card = el('article', 'product-card');

  var media = el('div', 'product-card__media');
  var img = document.createElement('img');
  img.src = p.image;
  img.alt = p.name;
  img.loading = 'lazy';
  media.appendChild(img);

  var body = el('div', 'product-card__body');
  body.appendChild(el('h3', 'product-card__title', p.name));
  body.appendChild(el('p', 'product-card__meta', p.size));

  var footer = el('div', 'product-card__footer');
  var price = el('span', 'price', formatPrice(p.price));
  price.appendChild(el('small', '', 'บาท'));
  var buy = el('a', 'btn btn--gold', 'สั่งซื้อ');
  buy.href = href;
  footer.appendChild(price);
  footer.appendChild(buy);

  body.appendChild(footer);
  card.appendChild(media);
  card.appendChild(body);
  return card;
}

/* ==========================================================
   2) order.html — prefill from URL, submit to Apps Script
   Needs: #orderForm, #customerName, #contact, #items, #total, #note
   ========================================================== */

function initOrderPage() {
  var form = document.getElementById('orderForm');
  var params = new URLSearchParams(window.location.search);

  // Prefill BOTH fields from the URL: item -> #items, price -> #total
  var item = params.get('item');
  var price = params.get('price');
  if (item !== null) document.getElementById('items').value = item;
  if (price !== null) document.getElementById('total').value = price;

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var payload = {
      customerName: document.getElementById('customerName').value.trim(),
      contact: document.getElementById('contact').value.trim(),
      items: document.getElementById('items').value.trim(),
      total: document.getElementById('total').value.trim(),
      note: document.getElementById('note').value.trim()
    };

    var submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true; // prevent double orders

    fetch(ORDER_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(() => { window.location.href = 'thankyou.html'; })
    .catch(error => {
      console.error(error);
      if (submitBtn) submitBtn.disabled = false;
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    });
  });
}

/* ==========================================================
   3) admin.html — orders table from published Google Sheet CSV
   Needs: #ordersTable tbody
   Columns: date, customer, contact, items, total, note
   ========================================================== */

function initAdminPage() {
  var tbody = document.querySelector('#ordersTable tbody');
  var COLS = 6;

  function message(text) {
    tbody.textContent = '';
    var tr = document.createElement('tr');
    var td = el('td', 'muted', text);
    td.colSpan = COLS;
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  message('กำลังโหลดข้อมูล...');

  fetch(ORDERS_CSV_URL)
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function (text) {
      var rows = parseCSV(text);
      rows.shift(); // header row

      // Drop blank rows, then newest first (the sheet is appended chronologically)
      rows = rows.filter(function (r) {
        return r.some(function (c) { return c.trim() !== ''; });
      }).reverse();

      if (!rows.length) { message('ยังไม่มีคำสั่งซื้อ'); return; }

      tbody.textContent = '';
      rows.forEach(function (r) {
        var tr = document.createElement('tr');
        for (var i = 0; i < COLS; i++) {
          tr.appendChild(el('td', '', r[i] !== undefined ? r[i] : ''));
        }
        tbody.appendChild(tr);
      });
    })
    .catch(function (error) {
      console.error(error);
      message('โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้านี้อีกครั้ง');
    });
}

/* Minimal CSV parser: quoted fields, "" escapes, commas and
   line breaks inside quotes, \r\n or \n row endings. */
function parseCSV(text) {
  var rows = [];
  var row = [];
  var field = '';
  var inQuotes = false;

  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM

  for (var i = 0; i < text.length; i++) {
    var ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // last row without trailing newline
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
