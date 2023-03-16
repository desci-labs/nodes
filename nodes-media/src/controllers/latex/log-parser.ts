const logParser = function () {
  const LOG_WRAP_LIMIT = 79;
  const LATEX_WARNING_REGEX = /^LaTeX Warning: (.*)$/;
  const HBOX_WARNING_REGEX = /^(Over|Under)full \\(v|h)box/;
  const PACKAGE_WARNING_REGEX = /^(Package \b.+\b Warning:.*)$/;
  const LINES_REGEX = /lines? ([0-9]+)/;
  const PACKAGE_REGEX = /^Package (\b.+\b) Warning/;
  const LogText = function (text) {
    let i;
    this.text = text.replace(/(\r\n)|\r/g, '\n');
    const wrappedLines = this.text.split('\n');
    this.lines = [wrappedLines[0]];
    i = 1;
    while (i < wrappedLines.length) {
      if (wrappedLines[i - 1].length === LOG_WRAP_LIMIT && wrappedLines[i - 1].slice(-3) !== '...') {
        this.lines[this.lines.length - 1] += wrappedLines[i];
      } else {
        this.lines.push(wrappedLines[i]);
      }
      i++;
    }
    this.row = 0;
  };
  (function () {
    this.nextLine = function () {
      this.row++;
      if (this.row >= this.lines.length) {
        return false;
      } else {
        return this.lines[this.row];
      }
    };
    this.rewindLine = function () {
      this.row--;
    };
    this.linesUpToNextWhitespaceLine = function () {
      return this.linesUpToNextMatchingLine(/^ *$/);
    };
    this.linesUpToNextMatchingLine = function (match) {
      let nextLine;
      const lines = [];
      nextLine = this.nextLine();
      if (nextLine !== false) {
        lines.push(nextLine);
      }
      while (nextLine !== false && !nextLine.match(match) && nextLine !== false) {
        nextLine = this.nextLine();
        if (nextLine !== false) {
          lines.push(nextLine);
        }
      }
      return lines;
    };
  }.call(LogText.prototype));
  const state = {
    NORMAL: 0,
    ERROR: 1,
  };
  const LatexParser = function (text, options) {
    this.log = new LogText(text);
    this.state = state.NORMAL;
    options = options || {};
    this.fileBaseNames = options.fileBaseNames || [/compiles/, /\/usr\/local/];
    this.ignoreDuplicates = options.ignoreDuplicates;
    this.data = [];
    this.fileStack = [];
    this.currentFileList = this.rootFileList = [];
    this.openParens = 0;
  };
  (function () {
    this.parse = function () {
      while ((this.currentLine = this.log.nextLine()) !== false) {
        if (this.state === state.NORMAL) {
          if (this.currentLineIsError()) {
            this.state = state.ERROR;
            this.currentError = {
              line: null,
              file: this.currentFilePath,
              level: 'error',
              message: this.currentLine.slice(2),
              content: '',
              raw: this.currentLine + '\n',
            };
          } else if (this.currentLineIsRunawayArgument()) {
            this.parseRunawayArgumentError();
          } else if (this.currentLineIsWarning()) {
            this.parseSingleWarningLine(LATEX_WARNING_REGEX);
          } else if (this.currentLineIsHboxWarning()) {
            this.parseHboxLine();
          } else if (this.currentLineIsPackageWarning()) {
            this.parseMultipleWarningLine();
          } else {
            this.parseParensForFilenames();
          }
        }
        if (this.state === state.ERROR) {
          this.currentError.content += this.log.linesUpToNextMatchingLine(/^l\.[0-9]+/).join('\n');
          this.currentError.content += '\n';
          this.currentError.content += this.log.linesUpToNextWhitespaceLine().join('\n');
          this.currentError.content += '\n';
          this.currentError.content += this.log.linesUpToNextWhitespaceLine().join('\n');
          this.currentError.raw += this.currentError.content;
          const lineNo = this.currentError.raw.match(/l\.([0-9]+)/);
          if (lineNo) {
            this.currentError.line = parseInt(lineNo[1], 10);
          }
          this.data.push(this.currentError);
          this.state = state.NORMAL;
        }
      }
      return this.postProcess(this.data);
    };
    this.currentLineIsError = function () {
      return this.currentLine[0] === '!';
    };
    this.currentLineIsRunawayArgument = function () {
      return this.currentLine.match(/^Runaway argument/);
    };
    this.currentLineIsWarning = function () {
      return !!this.currentLine.match(LATEX_WARNING_REGEX);
    };
    this.currentLineIsPackageWarning = function () {
      return !!this.currentLine.match(PACKAGE_WARNING_REGEX);
    };
    this.currentLineIsHboxWarning = function () {
      return !!this.currentLine.match(HBOX_WARNING_REGEX);
    };
    this.parseRunawayArgumentError = function () {
      this.currentError = {
        line: null,
        file: this.currentFilePath,
        level: 'error',
        message: this.currentLine,
        content: '',
        raw: this.currentLine + '\n',
      };
      this.currentError.content += this.log.linesUpToNextWhitespaceLine().join('\n');
      this.currentError.content += '\n';
      this.currentError.content += this.log.linesUpToNextWhitespaceLine().join('\n');
      this.currentError.raw += this.currentError.content;
      const lineNo = this.currentError.raw.match(/l\.([0-9]+)/);
      if (lineNo) {
        this.currentError.line = parseInt(lineNo[1], 10);
      }
      return this.data.push(this.currentError);
    };
    this.parseSingleWarningLine = function (prefix_regex) {
      const warningMatch = this.currentLine.match(prefix_regex);
      if (!warningMatch) {
        return;
      }
      const warning = warningMatch[1];
      const lineMatch = warning.match(LINES_REGEX);
      const line = lineMatch ? parseInt(lineMatch[1], 10) : null;
      this.data.push({
        line: line,
        file: this.currentFilePath,
        level: 'warning',
        message: warning,
        raw: warning,
      });
    };
    this.parseMultipleWarningLine = function () {
      let warningMatch = this.currentLine.match(PACKAGE_WARNING_REGEX);
      if (!warningMatch) {
        return;
      }
      const warning_lines = [warningMatch[1]];
      let lineMatch = this.currentLine.match(LINES_REGEX);
      let line = lineMatch ? parseInt(lineMatch[1], 10) : null;
      const packageMatch = this.currentLine.match(PACKAGE_REGEX);
      const packageName = packageMatch[1];
      const prefixRegex = new RegExp('(?:\\(' + packageName + '\\))*[\\s]*(.*)', 'i');
      while (!!(this.currentLine = this.log.nextLine())) {
        lineMatch = this.currentLine.match(LINES_REGEX);
        line = lineMatch ? parseInt(lineMatch[1], 10) : line;
        warningMatch = this.currentLine.match(prefixRegex);
        warning_lines.push(warningMatch[1]);
      }
      const raw_message = warning_lines.join(' ');
      this.data.push({
        line: line,
        file: this.currentFilePath,
        level: 'warning',
        message: raw_message,
        raw: raw_message,
      });
    };
    this.parseHboxLine = function () {
      const lineMatch = this.currentLine.match(LINES_REGEX);
      const line = lineMatch ? parseInt(lineMatch[1], 10) : null;
      this.data.push({
        line: line,
        file: this.currentFilePath,
        level: 'typesetting',
        message: this.currentLine,
        raw: this.currentLine,
      });
    };
    this.parseParensForFilenames = function () {
      const pos = this.currentLine.search(/\(|\)/);
      if (pos !== -1) {
        const token = this.currentLine[pos];
        this.currentLine = this.currentLine.slice(pos + 1);
        if (token === '(') {
          const filePath = this.consumeFilePath();
          if (filePath) {
            this.currentFilePath = filePath;
            const newFile = {
              path: filePath,
              files: [],
            };
            this.fileStack.push(newFile);
            this.currentFileList.push(newFile);
            this.currentFileList = newFile.files;
          } else {
            this.openParens++;
          }
        } else if (token === ')') {
          if (this.openParens > 0) {
            this.openParens--;
          } else {
            if (this.fileStack.length > 1) {
              this.fileStack.pop();
              const previousFile = this.fileStack[this.fileStack.length - 1];
              this.currentFilePath = previousFile.path;
              this.currentFileList = previousFile.files;
            }
          }
        }
        this.parseParensForFilenames();
      }
    };
    this.consumeFilePath = function () {
      if (!this.currentLine.match(/^\/?([^ \)]+\/)+/)) {
        return false;
      }
      const endOfFilePath = this.currentLine.search(RegExp(' |\\)'));
      let path = void 0;
      if (endOfFilePath === -1) {
        path = this.currentLine;
        this.currentLine = '';
      } else {
        path = this.currentLine.slice(0, endOfFilePath);
        this.currentLine = this.currentLine.slice(endOfFilePath);
      }
      return path;
    };
    return (this.postProcess = function (data) {
      const all = [];
      const errors = [];
      const warnings = [];
      const typesetting = [];
      const hashes = [];
      const hashEntry = function (entry) {
        return entry.raw;
      };
      let i = 0;
      while (i < data.length) {
        if (this.ignoreDuplicates && hashes.indexOf(hashEntry(data[i])) > -1) {
          i++;
          continue;
        }
        if (data[i].level === 'error') {
          errors.push(data[i]);
        } else if (data[i].level === 'typesetting') {
          typesetting.push(data[i]);
        } else if (data[i].level === 'warning') {
          warnings.push(data[i]);
        }
        all.push(data[i]);
        hashes.push(hashEntry(data[i]));
        i++;
      }
      return {
        errors: errors,
        warnings: warnings,
        typesetting: typesetting,
        all: all,
        files: this.rootFileList,
      };
    });
  }.call(LatexParser.prototype));
  LatexParser.parse = function (text, options) {
    return new LatexParser(text, options).parse();
  };
  return LatexParser;
};

export default logParser;
