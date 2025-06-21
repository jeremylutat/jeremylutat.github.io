window.addEventListener("DOMContentLoaded", () => {
  // Select all anchor tags in the author sidebar (adjust selector if needed)
  document.querySelectorAll(".author-bio .social-links a").forEach(link => {
    // Ensure this is really an external URL
    if (link.hostname !== window.location.hostname) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }
  });
});
