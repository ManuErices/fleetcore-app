export function formatMiles(value) {
  if (value === null || value === undefined || value === "") return "";
  const stringValue = value.toString().replace(/[^0-9.]/g, "");
  const parts = stringValue.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.join(",");
}

export function unformatMiles(value) {
  if (!value) return "";
  return value.toString().replace(/\./g, "").replace(",", ".");
}

export function formatRut(rut) {
  if (!rut) return "";
  let value = rut.replace(/\./g, "").replace("-", "");
  if (value.length <= 1) return value;
  let cuerpo = value.slice(0, -1);
  let dv = value.slice(-1).toUpperCase();
  cuerpo = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return cuerpo + "-" + dv;
}
