export function injectSubmitBridge(html: string): string {
  const bridge = `<script>
(() => {
  function formDataToObject(form) {
    const data = new FormData(form);
    const result = {};

    for (const [key, value] of data.entries()) {
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        result[key] = Array.isArray(result[key])
          ? [...result[key], value]
          : [result[key], value];
      } else {
        result[key] = value;
      }
    }

    for (const checkbox of form.querySelectorAll('input[type="checkbox"][name]')) {
      if (!checkbox.checked && !Object.prototype.hasOwnProperty.call(result, checkbox.name)) {
        result[checkbox.name] = false;
      }
    }

    return result;
  }

  document.addEventListener("submit", (event) => {
    event.preventDefault();
    window.glimpse.send({
      type: "form-submit",
      form: event.target.id || event.target.name || null,
      data: formDataToObject(event.target)
    });
  });
})();
</script>`;

  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${bridge}</body>`);
  return `${html}\n${bridge}`;
}
