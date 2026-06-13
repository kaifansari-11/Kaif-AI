let uploadedContent = "";
let uploadedImages = [];
let uploadedImageFile = null;
let uploadedImagePath = null;

let messages =
    JSON.parse(localStorage.getItem("messages")) || [];

function saveMessages() {

    localStorage.setItem(
        "messages",
        JSON.stringify(messages)
    );

}

function addCopyButtons() {

    document
        .querySelectorAll("pre code")
        .forEach(codeBlock => {

            const pre =
                codeBlock.parentElement;

            if (
                pre.querySelector(".copy-btn")
            ) return;

            const btn =
                document.createElement("button");

            btn.innerText = "Copy";

            btn.className =
                "copy-btn";

            btn.onclick = () => {

                navigator.clipboard.writeText(
                    codeBlock.innerText
                );

                btn.innerText = "Copied!";

                setTimeout(() => {

                    btn.innerText = "Copy";

                }, 1500);

            };

            pre.appendChild(btn);

        });

}

function loadChat() {

    const chatBox =
        document.getElementById("chat-box");

    messages.forEach(msg => {

        if (msg.role === "user") {

            chatBox.innerHTML += `
                <div class="user">
                    ${msg.content}
                </div>
            `;

        }

        if (msg.role === "assistant") {

            chatBox.innerHTML += `
                <div class="ai">
                    ${marked.parse(msg.content)}
                </div>
            `;

        }

    });

    chatBox.scrollTop = chatBox.scrollHeight;

    hljs.highlightAll();

    addCopyButtons();

}

async function handleImage(file) {

    const uploadedFilesDiv =
        document.getElementById("uploadedFiles");

    const imageUrl =
        URL.createObjectURL(file);

    uploadedImageFile = file;

    const puterFile =
        await puter.fs.write(
            `temp_${Date.now()}_${file.name}`,
            file
        );

    uploadedImagePath =
        puterFile.path;

    uploadedFilesDiv.innerHTML += `
        <div class="image-chip">
            <img src="${imageUrl}" alt="preview">
            <span>${file.name || "Image"}</span>
        </div>
    `;
}

document
    .getElementById("fileInput")
    .addEventListener("change", async function (e) {

        uploadedContent = "";

        const uploadedFilesDiv =
            document.getElementById("uploadedFiles");

        uploadedFilesDiv.innerHTML = "";

        const files = e.target.files;

        for (const file of files) {

            uploadedFilesDiv.innerHTML += `
    <div class="file-chip">
        <span>📎 ${file.name}</span>

        <button
            class="remove-file"
            onclick="removeFile(this)"
        >
            ✕
        </button>
    </div>
`;

            // TEXT FILES
            if (
                file.name.endsWith(".txt") ||
                file.name.endsWith(".md") ||
                file.name.endsWith(".html") ||
                file.name.endsWith(".css") ||
                file.name.endsWith(".js") ||
                file.name.endsWith(".json") ||
                file.name.endsWith(".py") ||
                file.name.endsWith(".java") ||
                file.name.endsWith(".cpp")
            ) {

                const text =
                    await file.text();

                uploadedContent +=
                    `\n\nFILE: ${file.name}\n\n${text}`;
            }

            // PDF FILES
            else if (
                file.type === "application/pdf"
            ) {

                const arrayBuffer =
                    await file.arrayBuffer();

                const pdf =
                    await pdfjsLib.getDocument({
                        data: arrayBuffer
                    }).promise;

                let pdfText = "";

                for (
                    let pageNum = 1;
                    pageNum <= pdf.numPages;
                    pageNum++
                ) {

                    const page =
                        await pdf.getPage(pageNum);

                    const content =
                        await page.getTextContent();

                    pdfText += content.items
                        .map(item => item.str)
                        .join(" ");

                    pdfText += "\n\n";
                }

                uploadedContent +=
                    `\n\nPDF FILE: ${file.name}\n\n${pdfText}`;
            }

            // EXCEL FILES
            else if (
                file.name.endsWith(".xlsx") ||
                file.name.endsWith(".xls")
            ) {

                const data =
                    await file.arrayBuffer();

                const workbook =
                    XLSX.read(data);

                workbook.SheetNames.forEach(
                    sheetName => {

                        const sheet =
                            workbook.Sheets[sheetName];

                        const json =
                            XLSX.utils.sheet_to_csv(sheet);

                        uploadedContent +=
                            `\n\nEXCEL SHEET: ${sheetName}\n\n${json}`;
                    }
                );
            }

            // IMAGES
            else if (
                file.type.startsWith("image/")
            ) {

                await handleImage(file);

            }

        }

        console.log(uploadedContent);

    });

function removeFile(btn) {

    btn.parentElement.remove();

    uploadedContent = "";
    uploadedImageFile = null;
    uploadedImagePath = null;
    uploadedImages = [];

    document.getElementById("fileInput").value = "";

}

function clearChat() {

    uploadedImages = [];
    uploadedImageFile = null;
    uploadedImagePath = null;

    messages = [];

    localStorage.removeItem("messages");

    document.getElementById("chat-box")
        .innerHTML = "";

    document.getElementById("uploadedFiles")
        .innerHTML = "";

}

function updateModelName() {

    document.getElementById("currentModel").innerText =
        "Current Model: " +
        document.getElementById("modelSelect").value;

}

async function sendMessage() {

    const promptBox = document.getElementById("prompt");
    const chatBox = document.getElementById("chat-box");

    const prompt = promptBox.value.trim();

    if (!prompt) return;

    chatBox.innerHTML += `
        <div class="user">
            ${prompt}
        </div>
    `;

    let finalPrompt = prompt;

    if (uploadedContent) {

        finalPrompt +=
            "\n\nUploaded Files:\n" +
            uploadedContent;

    }

    messages.push({
        role: "user",
        content: finalPrompt
    });

    saveMessages();

    promptBox.value = "";

    chatBox.innerHTML += `
        <div class="ai" id="loading">
            Thinking...
        </div>
    `;

    try {

        const selectedModel =
            document.getElementById("modelSelect").value;

        const recentMessages =
            messages.slice(-20);

        let response;

        if (uploadedImagePath) {

            response = await puter.ai.chat([
                {
                    role: "user",
                    content: [
                        {
                            type: "file",
                            puter_path: uploadedImagePath
                        },
                        {
                            type: "text",
                            text: prompt
                        }
                    ]
                }
            ], {
                model: selectedModel
            });

        } else {

            response = await puter.ai.chat(
                recentMessages,
                {
                    model: selectedModel
                }
            );

        }

        document.getElementById("loading").remove();

        const aiText =
            response.message.content[0].text;

        messages.push({
            role: "assistant",
            content: aiText
        });

        saveMessages();

        const html =
            marked.parse(aiText);

        chatBox.innerHTML += `
            <div class="ai">
                ${html}
            </div>
        `;

        uploadedContent = "";

        uploadedImageFile = null;

        if (uploadedImagePath) {

            try {
                await puter.fs.delete(uploadedImagePath);
            } catch { }

        }

        uploadedImagePath = null;

        document.getElementById("fileInput").value = "";

        document.getElementById("uploadedFiles").innerHTML = "";

        hljs.highlightAll();

        addCopyButtons();

    } catch (error) {

        document.getElementById("loading").remove();

        chatBox.innerHTML += `
            <div class="ai">
                Error: ${error.message}
            </div>
        `;

    }

    chatBox.scrollTop = chatBox.scrollHeight;

}

updateModelName();
loadChat();

document
    .getElementById("modelSelect")
    .addEventListener("change", updateModelName);

document
    .getElementById("prompt")
    .addEventListener("keydown", function (e) {

        if (e.key === "Enter" && !e.shiftKey) {

            e.preventDefault();
            sendMessage();

        }

    });

document
    .getElementById("clearBtn")
    .addEventListener("click", clearChat);

document.addEventListener("paste", async (e) => {

    const items = e.clipboardData.items;

    for (const item of items) {

        if (item.type.startsWith("image/")) {

            const file = item.getAsFile();

            handleImage(file);

        }

    }

});