/* globals define, angular */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['dash-quill'], factory)
  } else if (typeof module !== 'undefined' && typeof exports === 'object') {
    module.exports = factory(require('dash-quill'))
  } else {
    root.ngQuill = factory(root.Quill)
  }
}(this, function (Quill) {
  'use strict'

  // Polyfill for deprecated DOMNodeInserted mutation event
  // This fixes the deprecation warning without requiring Quill version update
  if (typeof MutationObserver !== 'undefined' && !document.addEventListener.toString().includes('DOMNodeInserted')) {
    (function() {
      var originalAddEventListener = EventTarget.prototype.addEventListener
      var originalRemoveEventListener = EventTarget.prototype.removeEventListener
      
      // Store observers for cleanup
      var observers = new WeakMap()
      
      // Helper function to create custom event objects
      function createMutationEvent(type, target, relatedNode, attrName, attrChange) {
        var event = {
          type: type,
          target: target,
          relatedNode: relatedNode,
          attrName: attrName,
          attrChange: attrChange,
          preventDefault: function() {},
          stopPropagation: function() {},
          stopImmediatePropagation: function() {}
        }
        return event
      }
      
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === 'DOMNodeInserted' || type === 'DOMNodeRemoved' || 
            type === 'DOMSubtreeModified' || type === 'DOMAttrModified' || 
            type === 'DOMCharacterDataModified') {
          
          if (!observers.has(this)) {
            observers.set(this, [])
          }
          
          var observerList = observers.get(this)
          var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
              var event
              var target = mutation.target
              
              switch (type) {
                case 'DOMNodeInserted':
                  if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function(node) {
                      if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
                        event = createMutationEvent('DOMNodeInserted', node, mutation.target)
                        listener.call(node, event)
                      }
                    })
                  }
                  break
                case 'DOMNodeRemoved':
                  if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                    mutation.removedNodes.forEach(function(node) {
                      if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
                        event = createMutationEvent('DOMNodeRemoved', node, mutation.target)
                        listener.call(node, event)
                      }
                    })
                  }
                  break
                case 'DOMSubtreeModified':
                  event = createMutationEvent('DOMSubtreeModified', target)
                  listener.call(target, event)
                  break
                case 'DOMAttrModified':
                  if (mutation.type === 'attributes') {
                    event = createMutationEvent('DOMAttrModified', target, null, mutation.attributeName, mutation.attributeName ? 1 : 2)
                    listener.call(target, event)
                  }
                  break
                case 'DOMCharacterDataModified':
                  if (mutation.type === 'characterData') {
                    event = createMutationEvent('DOMCharacterDataModified', target)
                    listener.call(target, event)
                  }
                  break
              }
            })
          })
          
          var config = {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
            attributeOldValue: true,
            characterDataOldValue: true
          }
          
          observer.observe(this, config)
          observerList.push({ observer: observer, listener: listener })
          
          return
        }
        
        return originalAddEventListener.call(this, type, listener, options)
      }
      
      EventTarget.prototype.removeEventListener = function(type, listener, options) {
        if (type === 'DOMNodeInserted' || type === 'DOMNodeRemoved' || 
            type === 'DOMSubtreeModified' || type === 'DOMAttrModified' || 
            type === 'DOMCharacterDataModified') {
          
          if (observers.has(this)) {
            var observerList = observers.get(this)
            for (var i = observerList.length - 1; i >= 0; i--) {
              if (observerList[i].listener === listener) {
                observerList[i].observer.disconnect()
                observerList.splice(i, 1)
              }
            }
            if (observerList.length === 0) {
              observers.delete(this)
            }
          }
          
          return
        }
        
        return originalRemoveEventListener.call(this, type, listener, options)
      }
    })()
  }

  // CSP-compatible style handling for Quill
  // This prevents inline style violations by intercepting and converting them to CSS classes
  (function() {
    if (typeof document !== 'undefined' && document.createElement) {
      var originalSetAttribute = Element.prototype.setAttribute
      var originalStyleSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'style')
      var styleCounter = 0
      var styleSheet = null
      
      // Create a stylesheet for CSP-compatible styles
      var ensureStyleSheet = function() {
        if (!styleSheet) {
          styleSheet = document.createElement('style')
          styleSheet.type = 'text/css'
          styleSheet.setAttribute('data-ng-quill-csp', 'true')
          document.head.appendChild(styleSheet)
        }
        return styleSheet
      }
      
      // Convert inline styles to CSS classes
      var convertInlineStyleToClass = function(element, styleValue) {
        var className = 'ng-quill-csp-style-' + (++styleCounter)
        var styleSheet = ensureStyleSheet()
        
        // Add the style rule to the stylesheet
        var rule = '.' + className + ' { ' + styleValue + ' }'
        if (styleSheet.styleSheet) {
          // IE8
          styleSheet.styleSheet.cssText += rule
        } else {
          // Modern browsers
          styleSheet.appendChild(document.createTextNode(rule))
        }
        
        return className
      }
      
      // Override setAttribute to intercept style attributes
      Element.prototype.setAttribute = function(name, value) {
        if (name === 'style' && typeof value === 'string' && value.trim()) {
          try {
            // Try to set the style attribute normally first
            return originalSetAttribute.call(this, name, value)
          } catch (e) {
            // If CSP blocks it, convert to CSS class
            if (e.name === 'SecurityError' || e.message.includes('Content Security Policy')) {
              var className = convertInlineStyleToClass(this, value)
              this.classList.add(className)
              this.setAttribute('data-original-style', value)
              return
            }
            throw e
          }
        }
        
        return originalSetAttribute.call(this, name, value)
      }
      
      // Override style property setter to handle CSP violations
      if (originalStyleSetter && originalStyleSetter.set) {
        Object.defineProperty(Element.prototype, 'style', {
          get: originalStyleSetter.get,
          set: function(value) {
            try {
              return originalStyleSetter.set.call(this, value)
            } catch (e) {
              if (e.name === 'SecurityError' || e.message.includes('Content Security Policy')) {
                // Convert style object to CSS class
                var styleString = ''
                if (typeof value === 'string') {
                  styleString = value
                } else if (value && typeof value === 'object') {
                  for (var prop in value) {
                    if (value.hasOwnProperty(prop)) {
                      styleString += prop + ': ' + value[prop] + '; '
                    }
                  }
                }
                
                if (styleString.trim()) {
                  var className = convertInlineStyleToClass(this, styleString)
                  this.classList.add(className)
                }
                return
              }
              throw e
            }
          },
          configurable: true
        })
      }
      
      // Also override style property methods
      if (Element.prototype.style && Element.prototype.style.setProperty) {
        var originalSetProperty = Element.prototype.style.setProperty
        Element.prototype.style.setProperty = function(property, value, priority) {
          try {
            return originalSetProperty.call(this, property, value, priority)
          } catch (e) {
            if (e.name === 'SecurityError' || e.message.includes('Content Security Policy')) {
              // Convert individual property to CSS class
              var styleString = property + ': ' + value + (priority ? ' !' + priority : '') + ';'
              var className = convertInlineStyleToClass(this, styleString)
              this.classList.add(className)
              return
            }
            throw e
          }
        }
      }
      
      // Override cssText setter
      if (Element.prototype.style && Element.prototype.style.cssText !== undefined) {
        var originalCssTextSetter = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'cssText')
        if (originalCssTextSetter && originalCssTextSetter.set) {
          Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', {
            get: originalCssTextSetter.get,
            set: function(value) {
              try {
                return originalCssTextSetter.set.call(this, value)
              } catch (e) {
                if (e.name === 'SecurityError' || e.message.includes('Content Security Policy')) {
                  // Convert cssText to CSS class
                  if (value && value.trim()) {
                    var className = convertInlineStyleToClass(this.parentElement || document.body, value)
                    if (this.parentElement) {
                      this.parentElement.classList.add(className)
                    }
                  }
                  return
                }
                throw e
              }
            },
            configurable: true
          })
        }
      }
    }
  })()

  // Check if Quill is available
  if (!Quill) {
    throw new Error('Quill is not available. Please make sure Quill is loaded before ng-quill.')
  }

  var app
  // declare ngQuill module
  app = angular.module('ngQuill', ['ngSanitize'])

  app.provider('ngQuillConfig', function () {
    var config = {
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
          ['blockquote', 'code-block'],

          [{ 'header': 1 }, { 'header': 2 }],               // custom button values
          [{ 'list': 'ordered' }, { 'list': 'bullet' }],
          [{ 'script': 'sub' }, { 'script': 'super' }],      // superscript/subscript
          [{ 'indent': '-1' }, { 'indent': '+1' }],          // outdent/indent
          [{ 'direction': 'rtl' }],                         // text direction

          [{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
          [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

          [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
          [{ 'font': [] }],
          [{ 'align': [] }],

          ['clean'],                                         // remove formatting button

          ['link', 'image', 'video']                         // link and image, video
        ]
      },
      bounds: document.body,
      debug: 'warn',
      theme: 'snow',
      scrollingContainer: null,
      placeholder: 'Insert text here ...',
      readOnly: false,
      trackChanges: 'user',
      preserveWhitespace: false
    }

    this.set = function (customConf) {
      customConf = customConf || {}

      if (customConf.modules) {
        config.modules = customConf.modules
      }
      if (customConf.theme) {
        config.theme = customConf.theme
      }
      if (customConf.placeholder !== null && customConf.placeholder !== undefined) {
        config.placeholder = customConf.placeholder.trim()
      }
      if (customConf.readOnly) {
        config.readOnly = customConf.readOnly
      }
      if (customConf.formats) {
        config.formats = customConf.formats
      }
      if (customConf.bounds) {
        config.bounds = customConf.bounds
      }
      if (customConf.scrollingContainer) {
        config.scrollingContainer = customConf.scrollingContainer
      }
      if (customConf.debug || customConf.debug === false) {
        config.debug = customConf.debug
      }
      if (customConf.trackChanges && ['all', 'user'].indexOf(customConf.trackChanges) > -1) {
        config.trackChanges = customConf.trackChanges
      }
      if (customConf.preserveWhitespace) {
        config.preserveWhitespace = true
      }
    }

    this.$get = function () {
      return config
    }
  })

  app.component('ngQuillEditor', {
    bindings: {
      'modules': '<modules',
      'theme': '@?',
      'readOnly': '<?',
      'format': '@?',
      'debug': '@?',
      'formats': '<?',
      'placeholder': '<?',
      'bounds': '<?',
      'scrollingContainer': '<?',
      'strict': '<?',
      'onEditorCreated': '&?',
      'onContentChanged': '&?',
      'onBlur': '&?',
      'onFocus': '&?',
      'onSelectionChanged': '&?',
      'ngModel': '<',
      'maxLength': '<',
      'minLength': '<',
      'customOptions': '<?',
      'classes': '<?',
      'sanitize': '<?',
      'customToolbarPosition': '@?',
      'trackChanges': '@?',
      'preserveWhitespace': '<?',
    },
    require: {
      ngModelCtrl: 'ngModel'
    },
    transclude: {
      'toolbar': '?ngQuillToolbar'
    },
    template: '<div class="ng-hide" ng-show="$ctrl.ready"><ng-transclude ng-transclude-slot="toolbar"></ng-transclude></div>',
    controller: ['$scope', '$element', '$sanitize', '$timeout', '$transclude', 'ngQuillConfig', function ($scope, $element, $sanitize, $timeout, $transclude, ngQuillConfig) {
      var config = {}
      var content
      var editorElem
      var format = 'html'
      var editorChanged = false
      var editor
      var placeholder = ngQuillConfig.placeholder
      var textChangeEvent
      var selectionChangeEvent

      this.setter = function (value) {
        if (format === 'html') {
          return editor.clipboard.convert(this.sanitize ? $sanitize(value) : value)
        } else if (this.format === 'json') {
          try {
            return JSON.parse(value)
          } catch (e) {
            return [{ insert: value }]
          }
        }

        return value
      }

      this.validate = function (text) {
        var textLength = text.trim().length

        if (this.maxLength) {
          if (textLength > this.maxLength) {
            this.ngModelCtrl.$setValidity('maxlength', false)
          } else {
            this.ngModelCtrl.$setValidity('maxlength', true)
          }
        }

        if (this.minLength > 0) {
          if (textLength === 0) {
            this.ngModelCtrl.$setValidity('minlength', true)
          } else if (textLength < this.minLength) {
            this.ngModelCtrl.$setValidity('minlength', false)
          } else {
            this.ngModelCtrl.$setValidity('minlength', true)
          }
        }
      }

      this.$onChanges = function (changes) {
        if (changes.ngModel) {
          content = changes.ngModel.currentValue

          if (editor) {
            if (!editorChanged) {
              if (content !== undefined && content !== null) {
                if (this.format === 'text') {
                  editor.setText(content)
                } else if (this.format === 'html' && typeof content === 'string' && content.indexOf('<') === -1) {
                  editor.setText(content)
                } else {
                  editor.setContents(
                    this.setter(content)
                  )
                }
                } else {
                editor.setText('')
              }
                this.validate(editor.getText())
            }
            editorChanged = false
          }
        }

        if (editor && changes.readOnly) {
          editor.enable(!changes.readOnly.currentValue)
        }

        if (editor && changes.placeholder) {
          editor.root.dataset.placeholder = changes.placeholder.currentValue
        }

        if (editor && editorElem && changes.classes) {
          var currentClasses = changes.classes.currentValue
          var previousClasses = changes.classes.previousValue

          // remove previous classes
          if (previousClasses) {
            if (Array.isArray(previousClasses)) {
              previousClasses.forEach(function (cls) {
                if (cls) { editorElem.classList.remove(cls) }
              })
            } else if (typeof previousClasses === 'object') {
              for (var prevCls in previousClasses) {
                if (previousClasses.hasOwnProperty(prevCls)) {
                  editorElem.classList.remove(prevCls)
                }
              }
            }
          }

          // add current classes
          if (currentClasses) {
            if (Array.isArray(currentClasses)) {
              currentClasses.forEach(function (cls) {
                if (cls) { editorElem.classList.add(cls) }
              })
            } else if (typeof currentClasses === 'object') {
              for (var cls in currentClasses) {
                if (currentClasses.hasOwnProperty(cls) && currentClasses[cls]) {
                  editorElem.classList.add(cls)
                }
              }
            }
          }
        }
      }

      this.$onInit = function () {
        if (this.placeholder !== null && this.placeholder !== undefined) {
          placeholder = this.placeholder.trim()
        }

        if (this.format && ['object', 'html', 'text', 'json'].indexOf(this.format) > -1) {
          format = this.format
        }

        config = {
          theme: this.theme || ngQuillConfig.theme,
          readOnly: this.readOnly || ngQuillConfig.readOnly,
          modules: this.modules || ngQuillConfig.modules,
          formats: this.formats || ngQuillConfig.formats,
          placeholder: placeholder,
          bounds: this.bounds || ngQuillConfig.bounds,
          strict: this.strict,
          scrollingContainer: this.scrollingContainer || ngQuillConfig.scrollingContainer,
          debug: this.debug || this.debug === false ? this.debug : ngQuillConfig.debug
        }
      }

      this.$postLink = function () {
        // create quill instance after dom is rendered
        $timeout(function () {
          if (content === undefined && this.ngModel !== undefined) {
            content = this.ngModel
          }
          this._initEditor()
        }.bind(this), 0)
      }

      this.$onDestroy = function () {
        editor = null

        if (textChangeEvent) {
          textChangeEvent.removeListener('text-change')
        }
        if (selectionChangeEvent) {
          selectionChangeEvent.removeListener('selection-change')
        }
      }

      this._initEditor = function () {
        // Check if Quill is available
        if (!Quill || typeof Quill !== 'function') {
          throw new Error('Quill constructor is not available. Please make sure Quill is properly loaded.')
        }

        var $editorElem = this.preserveWhitespace ? angular.element('<pre></pre>') : angular.element('<div></div>')
        var container = $element.children()

        editorElem = $editorElem[0]

        // Create a copy of config to avoid modifying the original
        var editorConfig = angular.copy(config)

        if (editorConfig.bounds === 'self') {
          editorConfig.bounds = editorElem
        }

        // set toolbar to custom one
        if ($transclude.isSlotFilled('toolbar')) {
          var toolbarElement = container.find('ng-quill-toolbar').children()[0]
          if (toolbarElement) {
            editorConfig.modules = editorConfig.modules || {}
            editorConfig.modules.toolbar = toolbarElement
          }
        }

        if (this.classes) {
          if (Array.isArray(this.classes)) {
            this.classes.forEach(function (cls) { if (cls) { editorElem.classList.add(cls) } })
          } else if (typeof this.classes === 'object') {
            for (var cls in this.classes) {
              if (this.classes.hasOwnProperty(cls) && this.classes[cls]) {
                editorElem.classList.add(cls)
              }
            }
          }
        }

        if (!this.customToolbarPosition || this.customToolbarPosition === 'top') {
          container.append($editorElem)
        } else {
          container.prepend($editorElem)
        }

        // Handle custom options with better error handling
        if (this.customOptions && Array.isArray(this.customOptions)) {
          this.customOptions.forEach(function (customOption) {
            try {
              if (customOption.import && Quill.import) {
                var newCustomOption = Quill.import(customOption.import)
                if (customOption.whitelist) {
                  newCustomOption.whitelist = customOption.whitelist
                }
                if (customOption.toRegister) {
                  newCustomOption[customOption.toRegister.key] = customOption.toRegister.value
                }
                Quill.register(newCustomOption, true)
              }
            } catch (e) {
              console.warn('ng-quill: Failed to register custom option:', customOption, e)
            }
          })
        }

        try {
          editor = new Quill(editorElem, editorConfig)
        } catch (error) {
          console.error('ng-quill: Failed to create Quill editor:', error)
          console.error('ng-quill: Editor config:', editorConfig)
          console.error('ng-quill: Editor element:', editorElem)
          throw new Error('Failed to create Quill editor: ' + error.message)
        }

        this.ready = true

        // mark model as touched if editor lost focus
        selectionChangeEvent = editor.on('selection-change', function (range, oldRange, source) {
          if (range === null && this.onBlur) {
            this.onBlur({
              editor: editor,
              source: source
            })
          } else if (oldRange === null && this.onFocus) {
            this.onFocus({
              editor: editor,
              source: source
            })
          }

          if (this.onSelectionChanged) {
            this.onSelectionChanged({
              editor: editor,
              oldRange: oldRange,
              range: range,
              source: source
            })
          }

          if (range) {
            return
          }
          $scope.$applyAsync(function () {
            this.ngModelCtrl.$setTouched()
          }.bind(this))
        }.bind(this))

        // update model if text changes
        textChangeEvent = editor.on('text-change', function (delta, oldDelta, source) {
          var html = editorElem.querySelector('.ql-editor').innerHTML
          var text = editor.getText()
          var content = editor.getContents()

          if (text.trim().length === 0) {
            html = null
          }
          
          // Check maxlength before applying changes
          if (this.maxLength && text.trim().length > this.maxLength && source === 'user') {
            // Revert the change by restoring the old content
            editor.setContents(oldDelta)
            return
          }
          
          this.validate(text)

          $scope.$applyAsync(function () {
            var trackChanges = this.trackChanges || ngQuillConfig.trackChanges
            if (source === 'user' || trackChanges && trackChanges === 'all') {
              editorChanged = true
              if (format === 'text') {
                // if nothing changed $ngOnChanges is not called again
                // But we have to reset editorChanged flag
                if (text === this.ngModelCtrl.$viewValue) {
                  editorChanged = false
                } else {
                  this.ngModelCtrl.$setViewValue(text)
                }
              } else if (format === 'object') {
                this.ngModelCtrl.$setViewValue(content)
              } else if (this.format === 'json') {
                try {
                  this.ngModelCtrl.$setViewValue(JSON.stringify(content))
                } catch (e) {
                  this.ngModelCtrl.$setViewValue(text)
                }
              } else {
                this.ngModelCtrl.$setViewValue(html)
              }
            }

            if (this.onContentChanged) {
              this.onContentChanged({
                editor: editor,
                html: html,
                text: text,
                content: content,
                delta: delta,
                oldDelta: oldDelta,
                source: source
              })
            }
          }.bind(this))
        }.bind(this))

        // set initial content
        if (content) {
          if (format === 'text') {
            editor.setText(content, 'silent')
          } else if (format === 'object') {
            editor.setContents(content, 'silent')
          } else if (format === 'json') {
            try {
              editor.setContents(JSON.parse(content), 'silent')
            } catch (e) {
              editor.setText(content, 'silent')
            }
          } else {
            if (typeof content === 'string' && content.indexOf('<') === -1) {
              editor.setText(content, 'silent')
            } else {
              var delta = editor.clipboard.convert(this.sanitize ? $sanitize(content) : content)
              editor.setContents(delta, 'silent')
            }
          }

          editor.history.clear()
        }
        this.validate(editor.getText())

        // provide event to get informed when editor is created -> pass editor object.
        if (this.onEditorCreated) {
          this.onEditorCreated({editor: editor})
        }
      }
    }]
  })

  return app.name
}))
