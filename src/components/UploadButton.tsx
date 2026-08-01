import { useState } from "react";
import Toast from "./Toast";

export default function UploadButton() {
  const [showToast, setShowToast] = useState(false);

  const handleUpload = () => {
    // your upload logic here
    setShowToast(true);
  };

  return (
    <div>
      <button
        onClick={handleUpload}
        className="bg-red-600 text-white px-4 py-2 rounded"
      >
        Upload
      </button>

      {showToast && (
        <Toast
          message="Upload successful!"
          type="success"
          onClose={() => setShowToast(false)} // 🔑 hide toast after fade
        />
      )}
    </div>
  );
}

