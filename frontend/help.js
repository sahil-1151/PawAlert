const form = document.querySelector("#help-form");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = form.querySelector(".form-status");
  const button = form.querySelector("button");
  button.disabled = true;
  status.textContent = "Sending your message...";
  try {
    const response = await fetch("http://127.0.0.1:8081/send_help_message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not send your message");
    status.className = "form-status success";
    status.textContent = "Message received. Check your email for the acknowledgement.";
    form.reset();
  } catch (error) {
    status.className = "form-status error";
    status.textContent = `${error.message}. Check that the email service is running on port 8081.`;
  } finally { button.disabled = false; }
});
