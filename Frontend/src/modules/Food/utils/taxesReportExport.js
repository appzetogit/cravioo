// Shared Excel export for the Taxes Reports (Restaurant Taxes Report + Admin Taxes Report).
// Follows the same "HTML table as .xls" convention already used across the codebase
// (see components/admin/orders/ordersExportUtils.js) - Excel opens HTML tables fine,
// and this keeps every report export in the app using one proven approach.

const escapeHtml = (value) => {
  if (value === null || value === undefined) return ""
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const formatDateTime = (value) => {
  if (!value) return "-"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

const formatMoney = (value) => `₹${Number(value || 0).toFixed(2)}`

/**
 * Builds and downloads an .xls file with a title/meta header, a data table, and a
 * bold totals row appended at the end.
 *
 * @param {object} opts
 * @param {string} opts.reportTitle - shown at the top of the file (e.g. "Restaurant Taxes Report")
 * @param {string[]} opts.metaLines - extra context lines under the title (restaurant name, period, generated-at)
 * @param {string[]} opts.headers - column headers
 * @param {Array<Array<string|number>>} opts.rows - table body rows, already formatted for display
 * @param {Array<string|number>} opts.totalsRow - final bold row (e.g. ["", "Grand Total", ...sums])
 * @param {string} opts.filename - base filename (date is appended automatically)
 */
export function downloadTaxesReportExcel({ reportTitle, metaLines = [], headers, rows, totalsRow, filename }) {
  if (!rows || rows.length === 0) {
    alert("No orders found for the selected period")
    return
  }

  const htmlContent = `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; }
          h2 { margin: 0 0 4px 0; }
          p.meta { margin: 0 0 2px 0; color: #444; font-size: 12px; }
          table { border-collapse: collapse; width: 100%; margin-top: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #1e293b; color: white; font-weight: bold; text-align: center; }
          td { white-space: nowrap; }
          tr:nth-child(even) { background-color: #f9fafb; }
          tr.totals td { font-weight: bold; background-color: #e2e8f0; }
        </style>
      </head>
      <body>
        <h2>${escapeHtml(reportTitle)}</h2>
        ${metaLines.map((line) => `<p class="meta">${escapeHtml(line)}</p>`).join("")}
        <table>
          <thead>
            <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
            <tr class="totals">${totalsRow.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
          </tbody>
        </table>
      </body>
    </html>
  `

  const blob = new Blob([htmlContent], { type: "application/vnd.ms-excel;charset=utf-8" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.xls`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Restaurant Taxes Report - per-order breakdown for one restaurant. Shared by admin + restaurant panel. */
export function exportRestaurantTaxesReport(reportData) {
  const { restaurant, period, orders, totals, generatedAt } = reportData || {}
  const metaLines = [
    `Restaurant: ${restaurant?.name || "N/A"}${restaurant?.code ? ` (${restaurant.code})` : ""}`,
    `Period: ${period?.startDate ? formatDateTime(period.startDate) : "All time"} - ${period?.endDate ? formatDateTime(period.endDate) : "Now"}`,
    `Generated on: ${formatDateTime(generatedAt || new Date())}`,
    `Total Orders: ${orders?.length || 0}`,
  ]

  const rows = (orders || []).map((o) => [
    o.orderId,
    formatDateTime(o.date),
    formatMoney(o.itemSubtotal),
    formatMoney(o.commission),
    formatMoney(o.packagingFee),
    formatMoney(o.total),
  ])

  const totalsRow = [
    "",
    "Grand Total",
    formatMoney(totals?.itemSubtotal),
    formatMoney(totals?.commission),
    formatMoney(totals?.packagingFee),
    formatMoney(totals?.total),
  ]

  downloadTaxesReportExcel({
    reportTitle: "Restaurant Taxes Report",
    metaLines,
    headers: ["Order ID", "Order Date", "Item Subtotal", "Commission Deducted", "Packing Fee Earned", "Order Total"],
    rows,
    totalsRow,
    filename: `restaurant_taxes_report_${restaurant?.code || restaurant?.name || "restaurant"}`,
  })
}

/** Admin Taxes Report - cross-restaurant order-level revenue breakdown. Admin-only. */
export function exportAdminTaxesReport(reportData) {
  const { period, orders, totals, generatedAt } = reportData || {}
  const metaLines = [
    `Period: ${period?.startDate ? formatDateTime(period.startDate) : "All time"} - ${period?.endDate ? formatDateTime(period.endDate) : "Now"}`,
    `Generated on: ${formatDateTime(generatedAt || new Date())}`,
    `Total Orders: ${orders?.length || 0}`,
  ]

  const rows = (orders || []).map((o) => [
    o.restaurantName,
    o.orderId,
    formatDateTime(o.date),
    formatMoney(o.commissionRevenue),
    formatMoney(o.platformFeeRevenue),
    formatMoney(o.total),
  ])

  const totalsRow = [
    "",
    "",
    "Grand Total",
    formatMoney(totals?.commissionRevenue),
    formatMoney(totals?.platformFeeRevenue),
    formatMoney(totals?.total),
  ]

  downloadTaxesReportExcel({
    reportTitle: "Admin Taxes Report",
    metaLines,
    headers: ["Restaurant Name", "Order ID", "Order Date", "Commission Revenue", "Platform Fee Revenue", "Total"],
    rows,
    totalsRow,
    filename: "admin_taxes_report",
  })
}
