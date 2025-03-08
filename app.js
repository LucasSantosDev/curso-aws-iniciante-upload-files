import express from 'express';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secretsManager = new SecretsManagerClient({ region: "us-east-1" });

const app = express();
const port = process.env.PORT || 3000;


let bucketName = "";


app.use(express.json({ limit: "50mb" }));


const s3 = new S3Client({ region: "us-east-1" });

async function loadBucketName() {
    try {
        const secretData = await secretsManager.send(new GetSecretValueCommand({ SecretId: "stg/AppUploadFile/Configs" }));
       
        if (secretData.SecretString) {
            const secretJson = JSON.parse(secretData.SecretString);
            if (secretJson.bucketName) {
                bucketName = secretJson.bucketName;
            } else {
                throw new Error("O segredo não contém 'bucketName'.");
            }
        }
    } catch (error) {
        console.error("Erro ao buscar segredo:", error);
        process.exit(1);
    }
 }
 
 await loadBucketName();

function validateBody(body) {
   const requiredFields = ["fileName", "fileContent"];
   const missingFields = requiredFields.filter(field => !body[field]);


   if (missingFields.length > 0) {
       throw new Error(`Os seguintes campos estão ausentes ou vazios: ${missingFields.join(", ")}`);
   }
}

app.get('/health', (req, res) => {
    const statusCodes = [200, 400, 500];
    const randomIndex = Math.floor(Math.random() * statusCodes.length);
    const randomStatus = statusCodes[randomIndex];
 
 
    const messages = {
        200: "API está saudável.",
        400: "Requisição inválida (simulação).",
        500: " Erro interno no servidor (simulação)."
    };
 
 
    return res.status(randomStatus).json({
        status: randomStatus,
        message: messages[randomStatus]
    });
 }); 

app.post('/upload', async (req, res) => {
   try {
       validateBody(req.body);


       const { fileName, fileContent } = req.body;


       const uploadParams = {
           Bucket: bucketName,
           Key: fileName,
           Body: Buffer.from(fileContent, "base64"),
           ContentEncoding: 'base64',
           ContentType: "application/octet-stream",
       };


       await s3.send(new PutObjectCommand(uploadParams));


       return res.status(200).json({ message: 'Arquivo enviado com sucesso', fileName });
   } catch (error) {
       return res.status(500).json({ message: 'Erro ao fazer upload', error: error.message });
   }
});


app.get('/files', async (req, res) => {
   try {
       const data = await s3.send(new ListObjectsV2Command({
           Bucket: bucketName,
       }));


       return res.status(200).json({ files: data.Contents || [] });
   } catch (error) {
       return res.status(500).json({ message: 'Erro ao listar arquivos', error: error.message });
   }
});


app.get('/files/:key', async (req, res) => {
   try {
       const { key } = req.params;
       const signedUrl = await getSignedUrl(
           s3,
           new GetObjectCommand({ Bucket: bucketName, Key: key }),
           { expiresIn: 3600 }
       );


       return res.status(200).json({ signedUrl });
   } catch (error) {
       return res.status(500).json({ message: 'Erro ao gerar URL assinada', error: error.message });
   }
});


app.listen(port, () => {
   console.log(`Servidor rodando em http://localhost:${port}`);
});
