import {Component, OnInit} from '@angular/core';

declare var BpmnJsDiffer: any;
declare var BpmnJS: any;

import {forEach, isObject, every, filter} from "min-dash";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  viewers:any;
  count: number = 0;
  changesTable:any;

  ngOnInit() {
    this.viewers = this.createViewers("left", "right");
    this.init();
  }

  createViewer = (side: any) => {
    return new BpmnJS({
      container: "#canvas-" + side,
      height: "100%",
      width: "100%",
      canvas: {
        deferUpdate: false
      }
    });
  }

  createViewers = (left: any, right: any) => {
    var sides: any = {};

    sides[left] = this.createViewer(left);
    sides[right] = this.createViewer(right);

    // sync navigation
    this.syncViewers(sides[left], sides[right]);

    return sides;
  }

  syncViewers = (a: any, b: any) => {
    var changing: any;

    function update(viewer: any) {
      return function (e: any) {
        if (changing) {
          return;
        }

        changing = true;
        viewer.get("canvas").viewbox(e.viewbox);
        changing = false;
      };
    }

    function syncViewbox(a: any, b: any) {
      a.on("canvas.viewbox.changed", update(b));
    }

    syncViewbox(a, b);
    syncViewbox(b, a);
  }

  getViewer = (side: any) => {
    return this.viewers[side];
  }

  diagramLoaded = (err: any, side: any, viewer: any) => {
    if (err) {
      console.error("load error", err);
    }

    this.setLoading(viewer, err || false);

    if (this.allDiagramsLoaded()) {
      // sync viewboxes
      var other = this.getViewer(side === "left" ? "right" : "left");
      viewer.get("canvas").viewbox(other.get("canvas").viewbox());

      this.showDiff(this.getViewer("left"), this.getViewer("right"));
    }
  }

  isLoaded = (v: any) => {
    return v.loading === false;
  }

  allDiagramsLoaded = () => {
    return every(this.viewers, this.isLoaded);
  }

  setLoading = (viewer: any, loading: any) => {
    viewer.loading = loading;
  }

  showDiff = (viewerOld: any, viewerNew: any) => {
    const that = this;
    var result = BpmnJsDiffer.diff(viewerOld.getDefinitions(), viewerNew.getDefinitions());

    forEach(this.viewers, this.clearDiffs);

    $.each(result._removed, function (i: any, obj: any) {
      that.highlight(viewerOld, i, "diff-removed");
      that.addMarker(viewerOld, i, "marker-removed", "&minus;");
    });

    $.each(result._added, function (i: any, obj: any) {
      that.highlight(viewerNew, i, "diff-added");
      that.addMarker(viewerNew, i, "marker-added", "&#43;");
    });

    $.each(result._layoutChanged, function (i: any, obj: any) {
      that.highlight(viewerOld, i, "diff-layout-changed");
      that.addMarker(viewerOld, i, "marker-layout-changed", "&#8680;");

      that.highlight(viewerNew, i, "diff-layout-changed");
      that.addMarker(viewerNew, i, "marker-layout-changed", "&#8680;");
    });

    function prettyPrint(obj: any) {
      return JSON.stringify(obj, null, "  ").replace(/"/g, "&quot;");
    }

    $.each(result._changed, function (i: any, obj: any) {
      that.highlight(viewerOld, i, "diff-changed");
      that.addMarker(viewerOld, i, "marker-changed", "&#9998;");

      that.highlight(viewerNew, i, "diff-changed");
      that.addMarker(viewerNew, i, "marker-changed", "&#9998;");

      var details = "<table><tr><th>Attribute</th><th>old</th><th>new</th></tr>";
      $.each(obj.attrs, function (attr: any, changes: any) {
        details =
          details +
          "<tr>" +
          "<td>" +
          attr +
          "</td>" +
          "<td " +
          (isObject(changes.oldValue)
            ? 'title="' + prettyPrint(changes.oldValue) + '"'
            : "") +
          ">" +
          changes.oldValue +
          "</td>" +
          "<td " +
          (isObject(changes.newValue)
            ? 'title="' + prettyPrint(changes.newValue) + '"'
            : "") +
          ">" +
          changes.newValue +
          "</td>" +
          "</tr>";
      });

      details = details + "</table></div>";

      viewerOld
        .get("elementRegistry")
        .getGraphics(i)
        .addEventListener("click", function (event: any) {
          $("#changeDetailsOld_" + i).toggle();
        });

      var detailsOld =
        '<div id="changeDetailsOld_' + i + '" class="changeDetails">' + details;

      // attach an overlay to a node
      viewerOld.get("overlays").add(i, "diff", {
        position: {
          bottom: -5,
          left: 0
        },
        html: detailsOld
      });

      $("#changeDetailsOld_" + i).toggle();

      viewerNew
        .get("elementRegistry")
        .getGraphics(i)
        .addEventListener("click", function (event: any) {
          $("#changeDetailsNew_" + i).toggle();
        });

      var detailsNew =
        '<div id="changeDetailsNew_' + i + '" class="changeDetails">' + details;

      // attach an overlay to a node
      viewerNew.get("overlays").add(i, "diff", {
        position: {
          bottom: -5,
          left: 0
        },
        html: detailsNew
      });

      $("#changeDetailsNew_" + i).toggle();
    });

    // create Table Overview of Changes
    this.showChangesOverview(result, viewerOld, viewerNew);
  }

  clearDiffs = (viewer: any) => {
    viewer.get("overlays").remove({type: "diff"});

    // TODO(nre): expose as external API
    forEach(viewer.get("elementRegistry")._elements, function (container: any) {
      var gfx = container.gfx,
        secondaryGfx = container.secondaryGfx;

      $(secondaryGfx || gfx)
        .removeClass("diff-added")
        .removeClass("diff-changed")
        .removeClass("diff-removed")
        .removeClass("diff-layout-changed");
    });
  }

  highlight = (viewer: any, elementId: any, marker: any) => {
    viewer.get("canvas").addMarker(elementId, marker);
  }

  unhighlight = (viewer: any, elementId: any, marker: any) => {
    viewer.get("canvas").removeMarker(elementId, marker);
  }

  diagramLoading = (side: any, viewer: any) => {
    this.setLoading(viewer, true);

    var loaded = filter(this.viewers, this.isLoaded);

    // clear diffs on loaded
    forEach(loaded, this.clearDiffs);

  }

  loadDiagram = (side: any, diagram: any) => {
    const that = this;
    var viewer = this.getViewer(side);

    function done(err: any) {
      that.diagramLoaded(err, side, viewer);
    }

    that.diagramLoading(side, viewer);

    if (diagram.xml) {
      return viewer.importXML(diagram.xml, done);
    }

    $.get(diagram.url, function (xml: any) {
      viewer.importXML(xml, done);
    });
  }

  openDiagram = (xml: any, side: any) => {
    this.loadDiagram(side, {xml: xml});
  }

  openFile = (file: any, target: any, done: any) => {
    var reader = new FileReader();

    reader.onload = function (e: any) {
      var xml = e.target.result;
      done(xml, target);
    };

    reader.readAsText(file);
  }

  addMarker = (viewer: any, elementId: any, className: any, symbol: any) => {
    var overlays = viewer.get("overlays");

    try {
      // attach an overlay to a node
      overlays.add(elementId, "diff", {
        position: {
          top: -12,
          right: 12
        },
        html: '<span class="marker ' + className + '">' + symbol + "</span>"
      });
    } catch (e) {

    }
  }

  addRow = (element: any, type: any, label: any) => {
    var that = this;
    var html =
      '<tr class="entry">' +
      "<td>" +
      that.count++ +
      "</td><td>" +
      (element.name || "") +
      "</td>" +
      "<td>" +
      element.$type.replace("bpmn:", "") +
      "</td>" +
      '<td><span class="status">' +
      label +
      "</span></td>" +
      "</tr>";

    $(html)
      .data({
        changed: type,
        element: element.id
      })
      .addClass(type)
      .appendTo(that.changesTable);
  }


  showChangesOverview = (result: any, viewerOld: any, viewerNew: any) => {
    const that = this;
    $("#changes-overview table").remove();
    that.changesTable = $(
      "<table>" +
      "<thead><tr><th>#</th><th>Name</th><th>Type</th><th>Change</th></tr></thead>" +
      "</table>"
    );
    $.each(result._removed, function (i: any, obj: any) {
      that.addRow(obj, "removed", "Removed");
    });

    $.each(result._added, function (i: any, obj: any) {
      that.addRow(obj, "added", "Added");
    });

    $.each(result._changed, function (i: any, obj: any) {
      that.addRow(obj.model, "changed", "Changed");
    });

    $.each(result._layoutChanged, function (i: any, obj: any) {
      that.addRow(obj, "layout-changed", "Layout Changed");
    });

    that.changesTable.appendTo("#changes-overview .changes");

    var HIGHLIGHT_CLS = "highlight";

    $("#changes-overview tr.entry").each(function () {
      var row = $(this);

      var id = row.data("element");
      var changed = row.data("changed");

      row.hover(
        function () {
          if (changed === "removed") {
            that.highlight(viewerOld, id, HIGHLIGHT_CLS);
          } else if (changed === "added") {
            that.highlight(viewerNew, id, HIGHLIGHT_CLS);
          } else {
            that.highlight(viewerOld, id, HIGHLIGHT_CLS);
            that.highlight(viewerNew, id, HIGHLIGHT_CLS);
          }
        },
        function () {
          if (changed === "removed") {
            that.unhighlight(viewerOld, id, HIGHLIGHT_CLS);
          } else if (changed === "added") {
            that.unhighlight(viewerNew, id, HIGHLIGHT_CLS);
          } else {
            that.unhighlight(viewerOld, id, HIGHLIGHT_CLS);
            that.unhighlight(viewerNew, id, HIGHLIGHT_CLS);
          }
        }
      );

      row.click(function () {
        var containerWidth: any = $(".di-container").width();
        var containerHeight: any = $(".di-container").height();

        var viewer = changed === "removed" ? viewerOld : viewerNew;

        var element = viewer.get("elementRegistry").get(id);

        var x, y;

        if (element === viewer.get("canvas").getRootElement()) {
          x = containerWidth / 2;
          y = containerHeight / 2 - 100;
        } else if (element.waypoints) {
          x = element.waypoints[0].x;
          y = element.waypoints[0].y;
        } else {
          x = element.x + element.width / 2;
          y = element.y + element.height / 2;
        }

        viewer.get("canvas").viewbox({
          x: x - containerWidth / 2,
          y: y - (containerHeight / 2 - 100),
          width: containerWidth,
          height: containerHeight
        });
      });
    });
  }


  init = (): void => {
    const that = this;
    $(".drop-zone").each(function () {
      var node: any = this;
      var element: any = $(node);
      element.append('<div class="drop-marker" />');
      node.addEventListener("dragover", handleDragOver, false);
      node.ownerDocument.body.addEventListener("dragover", handleDragLeave, false);
      node.addEventListener("drop", handleFileSelect, false);

      function handleDragOver(e: any) {
        removeMarker();

        e.stopPropagation();
        e.preventDefault();

        element.addClass("dropping");

        e.dataTransfer.dropEffect = "copy";
      }

      function handleDragLeave(e: any) {
        removeMarker();
      }

      function handleFileSelect(e: any) {
        e.stopPropagation();
        e.preventDefault();

        var files = e.dataTransfer.files;
        that.openFile(files[0], element.attr("target"), that.openDiagram);
        removeMarker();
      }

      function removeMarker() {
        $(".drop-zone").removeClass("dropping");
      }
    });
    $(".file").on("change", function (e: any) {
      that.openFile(e.target.files[0], $(this).attr("target"), that.openDiagram);
    });
    $("#changes-overview .show-hide-toggle").click(function () {
      $("#changes-overview").toggleClass("collapsed");
    });
    $("body").removeClass("preload");
  }
}
