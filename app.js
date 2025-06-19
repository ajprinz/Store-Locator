function initMap() {
  // Create the map.
  const map = new google.maps.Map(document.getElementById('map'), {
    zoom: 5,
    center: {lat: 39.8097343, lng: -98.5556199}
  });

  // Load the stores GeoJSON onto the map.
  map.data.loadGeoJson('stores.json', {idPropertyName: 'name'});

  const apiKey = 'AIzaSyA-RKDKkA8LwduBk95geB5wntBRtMsYQmU';
  const infoWindow = new google.maps.InfoWindow();

  // Show the information for a store when its marker is clicked.
  map.data.addListener('click', (event) => {
    const name = event.feature.getProperty('name');
    const address = event.feature.getProperty('address');
    const hours = event.feature.getProperty('phone');
    const phone = event.feature.getProperty('hours');
    const position = event.feature.getGeometry().get();
    const content = `
      <h2>${name}</h2><p>${address}</p>
      <p><b>${hours}<br/>${phone}</p>
    `;

    infoWindow.setContent(content);
    infoWindow.setPosition(position);
    infoWindow.setOptions({pixelOffset: new google.maps.Size(0, -30)});
    infoWindow.open(map);
  });

    // Build and add the search bar
  const card = document.createElement('div');
  const titleBar = document.createElement('div');
  const title = document.createElement('div');
  const container = document.createElement('div');
  const input = document.createElement('input');
  const options = {
    types: ['address'],
    componentRestrictions: {country: 'us'},
  };

  card.setAttribute('id', 'pac-card');
  title.setAttribute('id', 'title');
  title.textContent = 'Find the nearest store';
  titleBar.appendChild(title);
  container.setAttribute('id', 'pac-container');
  input.setAttribute('id', 'pac-input');
  input.setAttribute('type', 'text');
  input.setAttribute('placeholder', 'Enter an address');
  container.appendChild(input);
  card.appendChild(titleBar);
  card.appendChild(container);
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(card);

  // Make the search bar into a Places Autocomplete search bar and select
  // which detail fields should be returned about the place that
  // the user selects from the suggestions.
  const autocomplete = new google.maps.places.Autocomplete(input, options);

  autocomplete.setFields(
      ['address_components', 'geometry', 'name']);

 // Set the origin point when the user selects an address
  const originMarker = new google.maps.Marker({map: map});
  originMarker.setVisible(false);
  let originLocation = map.getCenter();

  autocomplete.addListener('place_changed', async () => {
    originMarker.setVisible(false);
    originLocation = map.getCenter();
    const place = autocomplete.getPlace();

    if (!place.geometry) {
      // User entered the name of a Place that was not suggested and
      // pressed the Enter key, or the Place Details request failed.
      window.alert('No address available for input: \'' + place.name + '\'');
      return;
    }

    // Recenter the map to the selected address
    originLocation = place.geometry.location;
    map.setCenter(originLocation);
    map.setZoom(13);
    console.log(place);

    originMarker.setPosition(originLocation);
    originMarker.setVisible(true);

    // Use the selected address as the origin to calculate distances
    // to each of the store locations
    const rankedStores = await calculateDistances(map.data, originLocation);
    showStoresList(map.data, rankedStores);
    return;

  });

}


function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // Earth's radius in meters
  const toRad = deg => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function calculateDistances(data, origin) {
  const originLat = origin.lat();
  const originLng = origin.lng();
  const nearbyStores = [];

  // Step 1: Filter all stores using Haversine (cheap, fast)
  data.forEach((store) => {
    const name = store.getProperty("name");
    const geometry = store.getGeometry().get();

    if (geometry) {
      const lat = geometry.lat();
      const lng = geometry.lng();
      const distance = haversineDistance(originLat, originLng, lat, lng);

      nearbyStores.push({
        storeName: name,
        lat,
        lng,
        distance,
        geometry
      });
    }
  });

  // Step 2: Sort by straight-line distance
  nearbyStores.sort((a, b) => a.distance - b.distance);

  // Step 3: Limit to top 25 stores
  const filteredStores = nearbyStores.slice(0, 25);

  const destinations = filteredStores.map(s => new google.maps.LatLng(s.lat, s.lng));
  const storeNames = filteredStores.map(s => s.storeName);

  // Step 4: Call Distance Matrix for refined driving distances
  const service = new google.maps.DistanceMatrixService();

  const results = await new Promise((resolve, reject) => {
    service.getDistanceMatrix(
      {
        origins: [origin],
        destinations: destinations,
        travelMode: "DRIVING",
        unitSystem: google.maps.UnitSystem.IMPERIAL,
      },
      (response, status) => {
        if (status !== "OK") {
          console.error("DistanceMatrixService error:", status);
          reject(new Error("Distance Matrix failed: " + status));
          return;
        }

        const distances = [];
        const elements = response.rows[0].elements;

        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          if (el.status === "OK") {
            distances.push({
              storeName: storeNames[i],
              distanceText: el.distance.text,
              distanceVal: el.distance.value
            });
          }
        }

        resolve(distances);
      }
    );
  });

  // Step 5: Sort again by driving distance and return top 5
  results.sort((a, b) => a.distanceVal - b.distanceVal);
  return results.slice(0, 10);
}



function showStoresList(data, stores) {
  if (stores.length == 0) {
    console.log('empty stores');
    return;
  }

  let panel = document.createElement('div');
  // If the panel already exists, use it. Else, create it and add to the page.
  if (document.getElementById('panel')) {
    panel = document.getElementById('panel');
    // If panel is already open, close it
    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
    }
  } else {
    panel.setAttribute('id', 'panel');
    const body = document.body;
    body.insertBefore(panel, body.childNodes[0]);
  }


  // Clear the previous details
  while (panel.lastChild) {
    panel.removeChild(panel.lastChild);
  }

  stores.forEach((store) => {
    // Add store details with text formatting
    const name = document.createElement('p');
    name.classList.add('place');
    const currentStore = data.getFeatureById(store.storeName);
    name.textContent = currentStore.getProperty('name');
    panel.appendChild(name);
    const distanceText = document.createElement('p');
    distanceText.classList.add('distanceText');
    distanceText.textContent = store.distanceText;
    panel.appendChild(distanceText);
  });

  // Open the panel
  panel.classList.add('open');

  return;
}