// Annotation handling for PDF viewer
(() => {
  let currentPdfProxy = null;
  let currentPageProxy = null;
  let pdfContainer = null;

  // Initialize annotation system
  async function initAnnotations() {
    if (!currentPdfProxy) {
      console.warn('PDF not loaded yet, will retry initialization');
      return;
    }

    try {
      // Get the current PDF URL or ID to use as storage key
      const pdfUrl = window.location.href;
      const pdfKey = `pdf_annotations_${btoa(pdfUrl)}`;

      // Load saved annotations from chrome.storage.local
      chrome.storage.local.get([pdfKey], (result) => {
        const savedAnnotations = result[pdfKey] || {};
        
        if (Object.keys(savedAnnotations).length > 0) {
          // Restore each annotation to the PDF
          Object.entries(savedAnnotations).forEach(([id, annotation]) => {
            try {
              currentPdfProxy.annotationStorage.setValue(id, {
                ...annotation,
                // Ensure required PDF.js annotation properties
                type: annotation.type || 'Text',
                color: annotation.color || [0, 0, 0],
                flags: annotation.flags || 0,
                rect: annotation.rect || [0, 0, 20, 20],
                rotation: annotation.rotation || 0
              });
            } catch (err) {
              console.error('Failed to restore annotation:', err);
            }
          });

          // Force redraw of current page
          if (currentPageProxy) {
            currentPdfProxy.getPage(currentPageProxy.pageNumber).then(() => {
              console.log('Page refreshed with restored annotations');
            });
          }
        }
      });
    } catch (error) {
      console.error('Error initializing annotations:', error);
    }
  }

  // Add text note to current page
  async function addTextNote() {
    if (!currentPdfProxy || !currentPageProxy) {
      console.warn('PDF not fully loaded');
      return;
    }

    const noteText = prompt('Enter your note:');
    if (!noteText) return;

    // Get click position for annotation
    const rect = pdfContainer.getBoundingClientRect();
    const x = rect.width / 2;  // Center horizontally
    const y = rect.height / 2; // Center vertically

    const annotationId = 'note_' + Date.now();
    const annotation = {
      type: 'Text',
      text: noteText,
      rect: [x, y, x + 20, y + 20], // 20x20 pixel note icon
      pageNumber: currentPageProxy.pageNumber,
      timestamp: Date.now()
    };

    // Store in PDF.js annotation storage
    currentPdfProxy.annotationStorage.setValue(annotationId, annotation);

    // Get current PDF URL or ID for storage key
    const pdfUrl = window.location.href;
    const pdfKey = `pdf_annotations_${btoa(pdfUrl)}`;

    // Persist to chrome.storage.local
    chrome.storage.local.get([pdfKey], (result) => {
      const annotations = result[pdfKey] || {};
      annotations[annotationId] = annotation;
      
      // Store annotations with PDF-specific key
      chrome.storage.local.set({ [pdfKey]: annotations }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving annotation:', chrome.runtime.lastError);
        } else {
          console.log('Annotation saved successfully');
        }
      });
    });

    // Force page redraw to show new annotation
    const pageNumber = currentPageProxy.pageNumber;
    await currentPdfProxy.getPage(pageNumber);
  }

  // Save PDF with annotations
  async function saveAnnotatedPdf() {
    if (!currentPdfProxy) {
      console.warn('PDF not loaded');
      return;
    }

    const saveButton = document.getElementById('saveAnnotatedPdf');
    saveButton.disabled = true;
    saveButton.textContent = '💾 Saving...';

    try {
      // Get original filename from URL or use default
      const urlParts = window.location.href.split('/');
      const originalName = decodeURIComponent(urlParts[urlParts.length - 1]);
      const filename = originalName.endsWith('.pdf') 
        ? originalName.replace('.pdf', '_annotated.pdf')
        : 'annotated.pdf';

      // Save document with annotations
      console.log('Saving PDF with annotations...');
      const pdfBytes = await currentPdfProxy.saveDocument({
        annotationStorage: currentPdfProxy.annotationStorage
      });

      // Create blob and download
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      
      chrome.downloads.download({
        url: blobUrl,
        filename: filename,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download failed:', chrome.runtime.lastError);
          alert('Failed to save PDF. Please try again.');
        } else {
          console.log('PDF saved successfully, download ID:', downloadId);
        }
        
        // Clean up
        URL.revokeObjectURL(blobUrl);
      });
    } catch (error) {
      console.error('Failed to save PDF:', error);
      alert('Failed to save PDF. Please try again.');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = '💾 Save PDF';
    }
  }

  // PDF.js event handlers
  window.addEventListener('message', async (event) => {
    if (event.data && event.data.type === 'pdf-loaded') {
      currentPdfProxy = event.data.pdfDocument;
      pdfContainer = document.getElementById('pdf-container');
      await initAnnotations();
    }
    if (event.data && event.data.type === 'page-rendered') {
      currentPageProxy = event.data.page;
    }
  });

  // Event listeners for UI
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('addTextNote').addEventListener('click', addTextNote);
    document.getElementById('saveAnnotatedPdf').addEventListener('click', saveAnnotatedPdf);
  });

  // Export functions for pdf_loader-compiled.js to call
  window.PDFAnnotationHandler = {
    setPdfDocument: (doc) => {
      currentPdfProxy = doc;
      initAnnotations();
    },
    setCurrentPage: (page) => {
      currentPageProxy = page;
    }
  };
})();
