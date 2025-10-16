export async function captureCanvasWithHUD(canvas: HTMLCanvasElement): Promise<Blob> {
  // For now, capture canvas only. If needed, we can composite HUD later.
  const dataUrl = canvas.toDataURL('image/png');
  const res = await fetch(dataUrl);
  return await res.blob();
}

export async function shareImage(blob: Blob, title = 'My Skeleton Physics Score') {
  const file = new File([blob], 'score.png', { type: 'image/png' });
  if (navigator.share && (navigator as any).canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title, text: title });
  } else {
    // Fallback: download
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'score.png';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
