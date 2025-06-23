class ExternalLinksHandler {
  constructor() { this.addAttributesToExternalLinks(); }

  addAttributesToExternalLinks() {
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
      if (this.isExternalLink(link)) {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      }
    });
  }

  isExternalLink(link) {
    return window.location.hostname !== new URL(link.href).hostname;
  }
}

document.addEventListener("DOMContentLoaded", () => new ExternalLinksHandler());
