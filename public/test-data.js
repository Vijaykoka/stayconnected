const rows = document.querySelector("#rows");

fetch("/test-data.json")
  .then((response) => response.json())
  .then((data) => {
    rows.innerHTML = data.rows
      .map((row) => {
        const url = `/?orderId=${encodeURIComponent(row.orderId)}&iccid=${encodeURIComponent(row.iccid)}&network=${encodeURIComponent(row.networkName)}&value=${encodeURIComponent(row.topUpValue)}`;
        return `
          <tr>
            <td><code>${row.orderId}</code></td>
            <td><strong>${row.iccid}</strong></td>
            <td><span class="badge" style="background:#e8f4fd;color:#0b5394;">${row.networkName}</span></td>
            <td><strong>${row.topUpValue}</strong></td>
            <td>
              <a href="${url}" class="link-button" style="min-height:30px;padding:4px 12px;font-size:12px;">Test Form</a>
            </td>
          </tr>
        `;
      })
      .join("");
  })
  .catch(() => {
    rows.innerHTML = '<tr><td colspan="5">Run npm run seed, then refresh this page.</td></tr>';
  });
