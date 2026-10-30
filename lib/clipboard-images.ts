export function clipboardImages(data: Pick<DataTransfer, "items" | "files">): File[] {
  const items = Array.from(data.items ?? []).filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile()).filter((file): file is File => file !== null);
  const images = items.length ? items : Array.from(data.files ?? []).filter(file => file.type.startsWith("image/"));
  return images.map((file, index) => file.name ? file : new File([file], `imagem-colada-${index + 1}.${file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]?.split("+")[0] || "png"}`, {
    type: file.type, lastModified: file.lastModified,
  }));
}
