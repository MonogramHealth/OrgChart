function init() {
	// Since 2.2 you can also author concise templates with method chaining instead of GraphObject.make
	// For details, see https://gojs.net/latest/intro/buildingObjects.html

	const $ = go.GraphObject.make;  // for conciseness in defining templates

	myDiagram = $(go.Diagram, "myDiagramDiv", { // must be the ID or reference to div
		initialAutoScale: go.Diagram.Uniform,
		maxSelectionCount: 1, // users can select only one part at a time
		validCycle: go.Diagram.CycleDestinationTree, // make sure users can only create trees
		"clickCreatingTool.archetypeNodeData": { // allow double-click in background to create a new node
			name: "(new person)",
			title: "",
			comments: ""
		},
		"clickCreatingTool.insertPart": function(loc) {  // override to scroll to the new node
			const node = go.ClickCreatingTool.prototype.insertPart.call(this, loc);
			if (node !== null) {
				this.diagram.select(node);
				this.diagram.commandHandler.scrollToPart(node);
				this.diagram.commandHandler.editTextBlock(node.findObject("NAMETB"));
			}
			return node;
		},
		layout: $(SideTreeLayout, {
			treeStyle: go.TreeLayout.StyleLastParents,
			arrangement: go.TreeLayout.ArrangementHorizontal,
			// properties for most of the tree:
			angle: 90,
			layerSpacing: 35,
			// properties for the "last parents":
			alternateAngle: 90,
			alternateLayerSpacing: 35,
			alternateAlignment: go.TreeLayout.AlignmentBus,
			alternateNodeSpacing: 20
		}),
		"undoManager.isEnabled": true // enable undo & redo
	});

	// manage boss info manually when a node or link is deleted from the diagram
	myDiagram.addDiagramListener("SelectionDeleting", e => {
		const part = e.subject.first(); // e.subject is the myDiagram.selection collection,
		// so we'll get the first since we know we only have one selection
		myDiagram.startTransaction("clear boss");
		if (part instanceof go.Node) {
			const it = part.findTreeChildrenNodes(); // find all child nodes
			while (it.next()) { // now iterate through them and clear out the boss information
				const child = it.value;
				const bossText = child.findObject("boss"); // since the boss TextBlock is named, we can access it by name
				if (bossText === null) return;
				bossText.text = "";
			}
		} else if (part instanceof go.Link) {
			const child = part.toNode;
			const bossText = child.findObject("boss"); // since the boss TextBlock is named, we can access it by name
			if (bossText === null) return;
			bossText.text = "";
		}
		myDiagram.commitTransaction("clear boss");
	});

	const levelColors = ["#AC193D", "#2672EC", "#8C0095", "#5133AB", "#008299", "#D24726", "#008A00", "#094AB2"];

	// override TreeLayout.commitNodes to also modify the background brush based on the tree depth level
	myDiagram.layout.commitNodes = function() {
		go.TreeLayout.prototype.commitNodes.call(this);  // do the standard behavior
		// then go through all of the vertexes and set their corresponding node's Shape.fill
		// to a brush dependent on the TreeVertex.level value
		myDiagram.layout.network.vertexes.each(v => {
			if (v.node) {
				const level = v.level % (levelColors.length);
				const color = levelColors[level];
				const shape = v.node.findObject("SHAPE");
				if (shape) shape.fill = $(go.Brush, "Linear", { 0: color, 1: go.Brush.lightenBy(color, 0.05), start: go.Spot.Left, end: go.Spot.Right });
			}
		});
	};

	// when a node is double-clicked, add a child to it
	function nodeDoubleClick(e, obj) {
		const clicked = obj.part;
		if (clicked !== null) {
			const thisemp = clicked.data;
			myDiagram.startTransaction("add employee");
			const newemp = {
				name: "(new person)",
				title: "",
				comments: "",
				parent: thisemp.key
			};
			myDiagram.model.addNodeData(newemp);
			myDiagram.commitTransaction("add employee");
		}
	}

  // this is used to determine feedback during drags
  function mayWorkFor(node1, node2) {
	if (!(node1 instanceof go.Node)) return false;  // must be a Node
	if (node1 === node2) return false;  // cannot work for yourself
	if (node2.isInTreeOf(node1)) return false;  // cannot work for someone who works for you
	return true;
  }

  // This function provides a common style for most of the TextBlocks.
  // Some of these values may be overridden in a particular TextBlock.
  function textStyle() {
	return { font: "15pt Macklin Text Regular", stroke: "white" };
  }

  // This converter is used by the Picture.
  function findHeadShot(key) {
	  var data = myDiagram.model.findNodeDataForKey(key);
	if (key < 0 || key > 18) return "img/BusinessMan.png"; // There are only 16 images on the server
	if (data.gender === "F") return "img/BusinessWoman.png";
	return "BusinessMan" + key + ".png"
  }

		  // define the Node template
		  myDiagram.nodeTemplate =
			$(go.Node, "Auto",
			  { doubleClick: nodeDoubleClick },
			  { // handle dragging a Node onto a Node to (maybe) change the reporting relationship
				mouseDragEnter: (e, node, prev) => {
				  const diagram = node.diagram;
				  const selnode = diagram.selection.first();
				  if (!mayWorkFor(selnode, node)) return;
				  const shape = node.findObject("SHAPE");
				  if (shape) {
					shape._prevFill = shape.fill;  // remember the original brush
					shape.fill = "darkred";
				  }
				},
				mouseDragLeave: (e, node, next) => {
				  const shape = node.findObject("SHAPE");
				  if (shape && shape._prevFill) {
					shape.fill = shape._prevFill;  // restore the original brush
				  }
				},
				mouseDrop: (e, node) => {
				  const diagram = node.diagram;
				  const selnode = diagram.selection.first();  // assume just one Node in selection
				  if (mayWorkFor(selnode, node)) {
					// find any existing link into the selected node
					const link = selnode.findTreeParentLink();
					if (link !== null) {  // reconnect any existing link
					  link.fromNode = node;
					} else {  // else create a new link
					  diagram.toolManager.linkingTool.insertLink(node, node.port, selnode, selnode.port);
					}
				  }
				}
			  },
			  // for sorting, have the Node.text be the data.name
			  new go.Binding("text", "name"),
			  // bind the Part.layerName to control the Node's layer depending on whether it isSelected
			  new go.Binding("layerName", "isSelected", sel => sel ? "Foreground" : "").ofObject(),
			  // define the node's outer shape
			  $(go.Shape, "RoundedRectangle",
				{
				  name: "SHAPE", fill: "white", stroke: null,
				  // set the port properties:
				  portId: "", fromLinkable: true, toLinkable: true, cursor: "pointer"
				}),
			  $(go.Panel, "Horizontal",
				$(go.Picture,
				  {
					name: "Picture",
					desiredSize: new go.Size(140, 150),
					margin: new go.Margin(6, 8, 6, 10),
				  },
				  new go.Binding("source", "key", findHeadShot)),
				// define the panel where the text will appear
				$(go.Panel, "Table",
				  {
					maxSize: new go.Size(400, 999),
					margin: new go.Margin(6, 10, 0, 3),
					defaultAlignment: go.Spot.Left
				  },
				  $(go.RowColumnDefinition, { column: 2, width: 4 }),
				  $(go.TextBlock, textStyle(),  // the name
					{
					  name: "NAMETB",
					  row: 0, column: 0, columnSpan: 5,
					  font: "24pt Macklin Text Regular",
					  editable: true, isMultiline: false,
					  minSize: new go.Size(10, 16)
					},
					new go.Binding("text", "name").makeTwoWay()),
				  $(go.TextBlock, "Title: ", textStyle(),
					{ row: 1, column: 0 }),
				  $(go.TextBlock, textStyle(),
					{
					  row: 1, column: 1, columnSpan: 4,
					  editable: true, isMultiline: false,
					  minSize: new go.Size(10, 14),
					  margin: new go.Margin(0, 0, 0, 3)
					},
					new go.Binding("text", "title").makeTwoWay()),
				  $(go.TextBlock, textStyle(),
					{ row: 2, column: 0 },
					new go.Binding("text", "key", v => "ID: " + v)),
				  $(go.TextBlock, textStyle(),
					{ name: "boss", row: 3, column: 0, }, // we include a name so we can access this TextBlock when deleting Nodes/Links
					new go.Binding("text", "parent", v => "Boss: " + v)),
				  $(go.TextBlock, textStyle(),  // the comments
					{
					  row: 4, column: 0, columnSpan: 5,
					  font: "italic 15pt Macklin Sans Regular",
					  wrap: go.TextBlock.WrapFit,
					  editable: true,  // by default newlines are allowed
					  minSize: new go.Size(10, 14)
					},
					new go.Binding("text", "comments").makeTwoWay())
				)  // end Table Panel
			  ) // end Horizontal Panel
			);  // end Node

		  // the context menu allows users to make a position vacant,
		  // remove a role and reassign the subtree, or remove a department
		  myDiagram.nodeTemplate.contextMenu =
			$("ContextMenu",
			  $("ContextMenuButton",
				$(go.TextBlock, "Vacate Position"),
				{
				  click: (e, obj) => {
					const node = obj.part.adornedPart;
					if (node !== null) {
					  const thisemp = node.data;
					  myDiagram.startTransaction("vacate");
					  // update the key, name, and comments
					  myDiagram.model.setDataProperty(thisemp, "name", "(Vacant)");
					  myDiagram.model.setDataProperty(thisemp, "comments", "");
					  myDiagram.commitTransaction("vacate");
					}
				  }
				}
			  ),
			  $("ContextMenuButton",
				$(go.TextBlock, "Remove Role"),
				{
				  click: (e, obj) => {
					// reparent the subtree to this node's boss, then remove the node
					const node = obj.part.adornedPart;
					if (node !== null) {
					  myDiagram.startTransaction("reparent remove");
					  const chl = node.findTreeChildrenNodes();
					  // iterate through the children and set their parent key to our selected node's parent key
					  while (chl.next()) {
						const emp = chl.value;
						myDiagram.model.setParentKeyForNodeData(emp.data, node.findTreeParentNode().data.key);
					  }
					  // and now remove the selected node itself
					  myDiagram.model.removeNodeData(node.data);
					  myDiagram.commitTransaction("reparent remove");
					}
				  }
				}
			  ),
			  $("ContextMenuButton",
				$(go.TextBlock, "Remove Department"),
				{
				  click: (e, obj) => {
					// remove the whole subtree, including the node itself
					const node = obj.part.adornedPart;
					if (node !== null) {
					  myDiagram.startTransaction("remove dept");
					  myDiagram.removeParts(node.findTreeParts());
					  myDiagram.commitTransaction("remove dept");
					}
				  }
				}
			  ),
			  $("ContextMenuButton",
				$(go.TextBlock, "Toggle Assistant"),
				{
				  click: (e, obj) => {
					// remove the whole subtree, including the node itself
					const node = obj.part.adornedPart;
					if (node !== null) {
					  myDiagram.startTransaction("toggle assistant");
					  myDiagram.model.setDataProperty(node.data, "isAssistant", !node.data.isAssistant);
					  myDiagram.layout.invalidateLayout();
					  myDiagram.commitTransaction("toggle assistant");
					}
				  }
				}
			  )
			);

		  // define the Link template
		  myDiagram.linkTemplate =
			$(go.Link, go.Link.Orthogonal,
			  { corner: 5, relinkableFrom: true, relinkableTo: true },
			  $(go.Shape, { strokeWidth: 4, stroke: "#00a4a4" }));  // the link shape

		  // read in the JSON-format data from the "mySavedModel" file
		  load();


		  // support editing the properties of the selected person in HTML
		  if (window.Inspector) myInspector = new Inspector("myInspector", myDiagram,
			{
			  properties: {
				"key": { readOnly: true },
				"comments": {},
				"isAssistant": { type: "boolean" }
			  },
			  propertyModified: (name, val) => {
				if (name === "isAssistant") myDiagram.layout.invalidateLayout();
			  }
			});
		}


		// Assume that the SideTreeLayout determines whether a node is an "assistant" if a particular data property is true.
		// You can adapt this code to decide according to your app's needs.
		function isAssistant(n) {
		  if (n === null) return false;
		  return n.data.isAssistant;
		}


	  // This is a custom TreeLayout that knows about "assistants".
	  // A Node for which isAssistant(n) is true will be placed at the side below the parent node
	  // but above all of the other child nodes.
	  // An assistant node may be the root of its own subtree.
	  // An assistant node may have its own assistant nodes.
	  class SideTreeLayout extends go.TreeLayout {
		makeNetwork(coll) {
		  const net = super.makeNetwork(coll);
		  // copy the collection of TreeVertexes, because we will modify the network
		  const vertexcoll = new go.Set(/*go.TreeVertex*/);
		  vertexcoll.addAll(net.vertexes);
		  for (const it = vertexcoll.iterator; it.next();) {
			const parent = it.value;
			// count the number of assistants
			let acount = 0;
			const ait = parent.destinationVertexes;
			while (ait.next()) {
			  if (isAssistant(ait.value.node)) acount++;
			}
			// if a vertex has some number of children that should be assistants
			if (acount > 0) {
			  // remember the assistant edges and the regular child edges
			  const asstedges = new go.Set(/*go.TreeEdge*/);
			  const childedges = new go.Set(/*go.TreeEdge*/);
			  let eit = parent.destinationEdges;
			  while (eit.next()) {
				const e = eit.value;
				if (isAssistant(e.toVertex.node)) {
				  asstedges.add(e);
				} else {
				  childedges.add(e);
				}
			  }
			  // first remove all edges from PARENT
			  eit = asstedges.iterator;
			  while (eit.next()) { parent.deleteDestinationEdge(eit.value); }
			  eit = childedges.iterator;
			  while (eit.next()) { parent.deleteDestinationEdge(eit.value); }
			  // if the number of assistants is odd, add a dummy assistant, to make the count even
			  if (acount % 2 == 1) {
				const dummy = net.createVertex();
				net.addVertex(dummy);
				net.linkVertexes(parent, dummy, asstedges.first().link);
			  }
			  // now PARENT should get all of the assistant children
			  eit = asstedges.iterator;
			  while (eit.next()) {
				parent.addDestinationEdge(eit.value);
			  }
			  // create substitute vertex to be new parent of all regular children
			  const subst = net.createVertex();
			  net.addVertex(subst);
			  // reparent regular children to the new substitute vertex
			  eit = childedges.iterator;
			  while (eit.next()) {
				const ce = eit.value;
				ce.fromVertex = subst;
				subst.addDestinationEdge(ce);
			  }
			  // finally can add substitute vertex as the final odd child,
			  // to be positioned at the end of the PARENT's immediate subtree.
			  const newedge = net.linkVertexes(parent, subst, null);
			}
		  }
		  return net;
		};

		assignTreeVertexValues(v) {
		  // if a vertex has any assistants, use Bus alignment
		  let any = false;
		  const children = v.children;
		  for (let i = 0; i < children.length; i++) {
			const c = children[i];
			if (isAssistant(c.node)) {
			  any = true;
			  break;
			}
		  }
		  if (any) {
			// this is the parent for the assistant(s)
			v.alignment = go.TreeLayout.AlignmentBus;  // this is required
			v.nodeSpacing = 50; // control the distance of the assistants from the parent's main links
		  } else if (v.node == null && v.childrenCount > 0) {
			// found the substitute parent for non-assistant children
			//v.alignment = go.TreeLayout.AlignmentCenterChildren;
			//v.breadthLimit = 3000;
			v.layerSpacing = 0;
		  }
		};

		commitLinks() {
		  super.commitLinks();
		  // make sure the middle segment of an orthogonal link does not cross over the assistant subtree
		  const eit = this.network.edges.iterator;
		  while (eit.next()) {
			const e = eit.value;
			if (e.link == null) continue;
			const r = e.link;
			// does this edge come from a substitute parent vertex?
			const subst = e.fromVertex;
			if (subst.node == null && r.routing == go.Link.Orthogonal) {
			  r.updateRoute();
			  r.startRoute();
			  // middle segment goes from point 2 to point 3
			  const p1 = subst.center;  // assume artificial vertex has zero size
			  const p2 = r.getPoint(2).copy();
			  const p3 = r.getPoint(3).copy();
			  const p5 = r.getPoint(r.pointsCount - 1);
			  let dist = 10;
			  if (subst.angle == 270 || subst.angle == 180) dist = -20;
			  if (subst.angle == 90 || subst.angle == 270) {
				p2.y = p5.y - dist; // (p1.y+p5.y)/2;
				p3.y = p5.y - dist; // (p1.y+p5.y)/2;
			  } else {
				p2.x = p5.x - dist; // (p1.x+p5.x)/2;
				p3.x = p5.x - dist; // (p1.x+p5.x)/2;
			  }
			  r.setPoint(2, p2);
			  r.setPoint(3, p3);
			  r.commitRoute();
			}
		  }
		}
	  }
	  // end of SideTreeLayout

	function load() {
		var rawFile = new XMLHttpRequest();
		rawFile.overrideMimeType("application/json");
		rawFile.open("GET", "https://raw.githubusercontent.com/MonogramHealth/OrgChart/main/js/model.json", true);
		rawFile.onreadystatechange = function() {
			if (rawFile.readyState === 4 && rawFile.status == "200") {
				var data = JSON.parse(rawFile.responseText);
				myDiagram.model = go.Model.fromJson(data);
			}
		}
		rawFile.send(null);

		// make sure new data keys are unique positive integers
		let lastkey = 1;
		myDiagram.model.makeUniqueKeyFunction = (model, data) => {
			let k = data.key || lastkey;
			while (model.findNodeDataForKey(k)) k++;
			data.key = lastkey = k;
			return k;
		};
	}

window.addEventListener('DOMContentLoaded', init);