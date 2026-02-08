import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMIkS7BHAVxoRMZ1DLl33eJDCvHmQV1i4",
  authDomain: "qrcodecounter-donationuhs.firebaseapp.com",
  projectId: "qrcodecounter-donationuhs",
  storageBucket: "qrcodecounter-donationuhs.firebasestorage.app",
  messagingSenderId: "331045631103",
  appId: "1:331045631103:web:fb7a6d97e103aa81eb7b4a",
  measurementId: "G-MG49TF1XS7",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };
