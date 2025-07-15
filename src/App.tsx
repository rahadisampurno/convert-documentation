import React, { useState } from 'react';
import { Upload, FileText, Download, AlertCircle } from 'lucide-react';

function App() {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState<string>('');

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoBase64(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement> | File) => {
    let file: File | undefined;
    if (event instanceof File) {
      file = event;
    } else {
      file = event.target.files?.[0];
    }
    if (!file) return;

    setLoading(true);
    setError('');
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('collection', file);
    if (logoBase64) formData.append('logo', logoBase64);
    if (customTitle) formData.append('customTitle', customTitle);

    try {
      const response = await fetch('http://localhost:3001/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to generate PDF');
      } else {
        setDownloadUrl('http://localhost:3001' + data.downloadUrl);
      }
    } catch (err) {
      setError('Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gradient-to-br from-blue-50 to-white py-12">
      <h1 className="text-4xl font-bold text-blue-900 mb-2 text-center drop-shadow">Postman Collection to PDF Documentation</h1>
      <p className="text-gray-600 mb-8 text-center max-w-xl">Upload your <b>collection.json</b> file, custom logo, and title to generate a professional API documentation PDF.</p>
      {!downloadUrl && (
        <div
          className={`w-full max-w-lg bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center border-2 transition-colors duration-200 ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Logo Upload */}
          <div className="mb-6 w-full flex flex-col items-center">
            <label className="block font-semibold mb-2 text-gray-700">Logo (optional)</label>
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-300 mb-2">
              {logoBase64 ? (
                <img src={logoBase64} alt="Logo Preview" className="object-contain w-full h-full" />
              ) : (
                <span className="text-gray-400 text-4xl">+</span>
              )}
            </div>
            <input type="file" accept="image/*" onChange={handleLogoChange} className="block w-full text-sm" />
          </div>

          {/* Judul */}
          <div className="mb-6 w-full">
            <label className="block font-semibold mb-1 text-gray-700">Judul (optional)</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="API Documentation Title"
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
            />
          </div>

          {/* File Upload */}
          <label className="w-full flex flex-col items-center cursor-pointer">
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-6 w-full hover:border-blue-400 transition">
              <Upload className="h-10 w-10 text-blue-400 mb-2" />
              <span className="text-lg font-medium text-gray-700">Choose collection.json file</span>
              <span className="text-gray-400 text-sm mt-1">or drag and drop your file here</span>
            </div>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {/* Feedback/Error/Loading */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 w-full">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span className="text-red-700">{error}</span>
            </div>
          )}
          {loading && (
            <div className="mt-4 w-full flex flex-col items-center">
              <div className="w-24 h-2 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 animate-pulse" style={{ width: '80%' }}></div>
              </div>
              <p className="mt-2 text-gray-600">Processing file...</p>
            </div>
          )}
        </div>
      )}

      {downloadUrl && (
        <div className="max-w-md mx-auto text-center mt-12 bg-white p-8 rounded-lg shadow">
          <FileText className="mx-auto h-12 w-12 text-blue-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">PDF Documentation Ready!</h2>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            <Download className="inline-block mr-2 h-5 w-5" />
            Download PDF
          </a>
          <button
            onClick={() => setDownloadUrl(null)}
            className="block mx-auto mt-6 text-blue-600 hover:underline"
          >
            Upload Another File
          </button>
        </div>
      )}
    </div>
  );
}

export default App;