import { httpUrl } from "./model";

type Options = {
  retryImage?: (url: string) => Promise<ArrayBuffer>;
  imageFailed: string;
  mediaFailed: string;
  captionsFailed: string;
  openMedia: string;
};

export function watchReaderMedia(body: HTMLElement, options: Options) {
  const controller = new AbortController();
  const images = new WeakMap<HTMLImageElement, { triedDefault: boolean; pending: boolean; url: string }>();
  const failures = new WeakSet<Element>();
  const objectUrls = new Set<string>();
  const requests = new Map<string, Promise<string>>();
  const lanes = Array.from({ length: 3 }, () => Promise.resolve());
  let lane = 0;

  function fetchImage(url: string) {
    const existing = requests.get(url);
    if (existing) return existing;
    const slot = lane++ % lanes.length;
    const request = lanes[slot].then(async () => {
      if (controller.signal.aborted) throw new Error("Reader changed");
      const bytes = await options.retryImage!(url);
      if (controller.signal.aborted) throw new Error("Reader changed");
      const objectUrl = URL.createObjectURL(new Blob([bytes]));
      objectUrls.add(objectUrl);
      return objectUrl;
    });
    requests.set(url, request);
    lanes[slot] = request.then(() => {}, () => {});
    return request;
  }

  function showFailure(element: Element, address: string, message: string, label = options.openMedia) {
    const url = httpUrl(address);
    if (!url || failures.has(element) || !body.contains(element)) return;
    const notice = document.createElement("div");
    notice.className = "reader-media-fallback";
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    notice.append(`${message} · `, link);
    element.after(notice);
    failures.add(element);
  }

  function imageFailed(image: HTMLImageElement) {
    const src = image.getAttribute("src") ?? "";
    const candidate = image.currentSrc || src;
    const previous = images.get(image);
    if (previous?.pending) return;
    const state = previous ?? { triedDefault: false, pending: false, url: candidate };
    images.set(image, state);
    const picture = image.parentElement?.matches("picture") ? image.parentElement : null;
    const displayNode = picture ?? image;
    const showImageFailure = (url: string) => {
      showFailure(displayNode, url, image.alt
        ? `${options.imageFailed} (${image.alt})` : options.imageFailed);
      displayNode.setAttribute("hidden", "");
    };
    if (!state.triedDefault && candidate !== src && httpUrl(src)) {
      state.triedDefault = true;
      state.url = src;
      image.removeAttribute("srcset");
      picture?.querySelectorAll("source").forEach((source) => source.remove());
      image.src = src;
      return;
    }
    if (!candidate.startsWith("blob:") && options.retryImage && candidate.startsWith("https://cdnfile.sspai.com/")) {
      state.pending = true;
      void fetchImage(candidate).then((objectUrl) => {
        if (controller.signal.aborted || !body.contains(image)) return;
        image.removeAttribute("srcset");
        picture?.querySelectorAll("source").forEach((source) => source.remove());
        image.src = objectUrl;
        state.pending = false;
      }).catch(() => {
        if (!controller.signal.aborted) showImageFailure(candidate);
      });
    } else showImageFailure(state.url);
  }

  function mediaError(event: Event) {
    const node = event.target;
    if (node instanceof HTMLImageElement) {
      imageFailed(node);
    } else if (node instanceof HTMLMediaElement) {
      showFailure(node, node.currentSrc || node.getAttribute("src") || "", options.mediaFailed);
    } else if (node instanceof HTMLSourceElement && node.parentElement instanceof HTMLMediaElement
      && !node.nextElementSibling?.matches("source")) {
      showFailure(node.parentElement, node.src, options.mediaFailed);
    } else if (node instanceof HTMLTrackElement && node.parentElement instanceof HTMLMediaElement) {
      showFailure(node.parentElement, node.src, options.captionsFailed);
    }
  }

  body.addEventListener("error", mediaError, true);
  for (const image of body.querySelectorAll("img[src]")) {
    if (image instanceof HTMLImageElement && image.complete && !image.naturalWidth) imageFailed(image);
  }
  return () => {
    controller.abort();
    body.removeEventListener("error", mediaError, true);
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  };
}
