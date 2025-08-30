/**
 * DOM Manipulation & Highlighting for Privately Extension
 */

const DOMHelpers = {
  /**
   * Clear all highlights from contenteditable elements
   */
  clearHighlights: (rootElement) => {
    if (!rootElement) return;
    
    const highlights = rootElement.querySelectorAll('span.pg-underline');
    highlights.forEach(span => {
      const textNode = document.createTextNode(span.textContent || '');
      span.replaceWith(textNode);
    });
  },

  /**
   * Add visual highlights to detected sensitive data in contenteditable elements
   */
  highlightContentEditable: (rootElement, spans) => {
    if (!rootElement || !spans?.length) return;

    // Sort spans by start position and ensure no overlaps
    const sortedSpans = [...spans]
      .sort((a, b) => a.start - b.start)
      .map(span => ({
        start: span.start,
        end: span.end,
        label: span.label
      }));

    // Create tree walker to traverse text nodes
    const walker = document.createTreeWalker(
      rootElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip text nodes that are already inside highlights
          return node.parentElement?.closest('.pg-underline') 
            ? NodeFilter.FILTER_REJECT 
            : NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let currentNode = walker.nextNode();
    let textOffset = 0;

    // Process each span for highlighting
    for (const span of sortedSpans) {
      const highlightResult = DOMHelpers.createHighlight(
        walker, currentNode, textOffset, span
      );
      
      if (highlightResult) {
        currentNode = highlightResult.nextNode;
        textOffset = highlightResult.newOffset;
      }
    }
  },

  /**
   * Create a highlight for a specific span
   */
  createHighlight: (walker, startNode, startOffset, span) => {
    let currentNode = startNode;
    let textOffset = startOffset;

    // Find start position
    while (currentNode) {
      const nodeLength = currentNode.nodeValue?.length || 0;
      if (textOffset + nodeLength >= span.start) {
        break;
      }
      textOffset += nodeLength;
      currentNode = walker.nextNode();
    }

    if (!currentNode) return null;

    // Find end position
    let endNode = currentNode;
    let endOffset = textOffset;
    
    while (endNode) {
      const nodeLength = endNode.nodeValue?.length || 0;
      if (endOffset + nodeLength >= span.end) {
        break;
      }
      endOffset += nodeLength;
      endNode = walker.nextNode();
    }

    if (!endNode) return null;

    try {
      // Create and apply highlight
      const range = document.createRange();
      range.setStart(currentNode, span.start - textOffset);
      range.setEnd(endNode, span.end - endOffset);

      const highlight = document.createElement('span');
      highlight.className = 'pg-underline';
      highlight.setAttribute('data-label', span.label);
      
      range.surroundContents(highlight);

      // Reset walker position
      walker.currentNode = highlight;
      return {
        nextNode: walker.nextNode(),
        newOffset: DOMHelpers.calculateTextLength(highlight.parentElement)
      };
    } catch (error) {
      console.warn('Failed to create highlight:', error);
      return null;
    }
  },

  /**
   * Calculate total text length of an element
   */
  calculateTextLength: (element) => {
    let length = 0;
    const iterator = document.createNodeIterator(element, NodeFilter.SHOW_TEXT);
    let node;
    
    while ((node = iterator.nextNode())) {
      length += node.nodeValue?.length || 0;
    }
    
    return length;
  }
};
