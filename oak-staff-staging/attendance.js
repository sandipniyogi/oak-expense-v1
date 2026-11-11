for (const form of document.querySelectorAll('form[action="/clock-in"], form[action="/clock-out"]')) {
  if (!form.querySelector('[name="latitude"]')) continue;
  const button = form.querySelector('button');
  const status = form.querySelector('[role="status"]');
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!navigator.geolocation) {
      status.textContent = 'Location is unavailable. Open the venue HTTPS address and enable location access.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Checking location…';
    navigator.geolocation.getCurrentPosition(({coords}) => {
      form.elements.latitude.value = coords.latitude;
      form.elements.longitude.value = coords.longitude;
      form.elements.accuracy.value = coords.accuracy;
      form.submit();
    }, () => {
      button.disabled = false;
      status.textContent = 'Could not get your location. Allow location access and try again.';
    }, {enableHighAccuracy: true, maximumAge: 0, timeout: 15000});
  });
}
