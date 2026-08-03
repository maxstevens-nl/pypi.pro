export const domain = (() => {
  if ($app.stage === "prod") return "pypi.pro";
  if ($app.stage === "dev") return "dev.pypi.pro";
  return `${$app.stage}.dev.pypi.pro`;
})();
