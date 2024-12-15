document.addEventListener("DOMContentLoaded", () => {
  const navbarPlaceholder = document.createElement("div");
  navbarPlaceholder.id = "navbar-placeholder";
  document.body.insertBefore(navbarPlaceholder, document.body.firstChild);

  fetch("navbar.html") // Ensure this path points to your navbar.html file
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.text();
    })
    .then((data) => {
      navbarPlaceholder.innerHTML = data;
    })
    .catch((error) => {
      console.error("Error loading navbar:", error);
      navbarPlaceholder.innerHTML =
        '<p style="color:red;">Failed to load navbar.</p>';
    });
});

function scrollGallery(direction) {
  const scrollContainer = document.getElementById("gallery");
  const scrollAmount = direction * 200; // Scroll by 200px per click
  scrollContainer.scrollBy({ left: scrollAmount, behavior: "smooth" });
}

function scrollCarousel(direction) {
  const carousel = document.getElementById("carousel");
  const scrollAmount = direction * carousel.offsetWidth; // Scroll by the container width
  carousel.scrollBy({ left: scrollAmount, behavior: "smooth" });
}

// CORS proxy URL
const proxyUrl = "https://corsproxy.io/?";

// InspireHEP API query URL
const queryUrl = `https://inspirehep.net/api/literature?q=cn:"na61"&a:"Adhikary"&format=json`;

// Final URL using CORS proxy
const apiUrl = proxyUrl + encodeURIComponent(queryUrl);

// Target container for displaying publications
const papersList = document.getElementById("papers-list");

// Fetch and display publications
async function fetchAndDisplayPapers() {
  try {
    console.log("Fetching publications..."); // Debug log
    const response = await fetch(apiUrl);

    // Check if the response is okay
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    console.log("API Response:", data); // Debug log

    // Check if publications exist
    if (!data.hits || !data.hits.hits || data.hits.hits.length === 0) {
      papersList.innerHTML =
        "<p>No publications found for the specified query.</p>";
      return;
    }

    // Display each publication
    data.hits.hits.forEach((paper) => {
      const metadata = paper.metadata;

      // Extract title, authors, and link
      const title = metadata.titles?.[0]?.title || "No title available";
      const authors =
        metadata.authors?.map((author) => author.full_name).join(", ") ||
        "Unknown authors";
      const link = metadata.doi
        ? `https://doi.org/${metadata.doi}`
        : metadata.arxiv_eprints?.[0]?.value
          ? `https://arxiv.org/abs/${metadata.arxiv_eprints[0].value}`
          : "#";

      // Create a paper card
      const paperCard = document.createElement("div");
      paperCard.classList.add("paper-card");

      // Add title
      const paperTitle = document.createElement("a");
      paperTitle.classList.add("paper-title");
      paperTitle.href = link;
      paperTitle.target = "_blank";
      paperTitle.innerText = title;

      // Add authors
      const paperAuthors = document.createElement("p");
      paperAuthors.classList.add("paper-authors");
      paperAuthors.innerText = `Authors: ${authors}`;

      // Append title and authors to the card
      paperCard.appendChild(paperTitle);
      paperCard.appendChild(paperAuthors);

      // Append the card to the list
      papersList.appendChild(paperCard);
    });
  } catch (error) {
    console.error("Error fetching publications:", error);
    papersList.innerHTML =
      "<p>Failed to load publications. Please try again later.</p>";
  }
}

// Call the function to fetch and display publications
fetchAndDisplayPapers();
