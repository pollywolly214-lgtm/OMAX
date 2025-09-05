document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("helloBtn");
  const out = document.getElementById("output");

  btn.addEventListener("click", () => {
    out.textContent = "JavaScript is working 🎉 Your site is live!";
  });
});
