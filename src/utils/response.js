export function sendSuccess(res, data) {
  return res.json({
    success: true,
    ...data,
  });
}
