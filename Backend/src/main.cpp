#include "crow.h"
#include <pqxx/pqxx>
    const int SHIFT_KEY = 5;
    std::string encryptPassword(const std::string& password) {
        std::string result = password;
        for (size_t i = 0; i < password.length(); i++) {
            int c = (int)password[i];
            int shifted = 32 + ((c - 32 + SHIFT_KEY) % 95);
            result[i] = (char)shifted;
        }
        return result;
        }
    //decryption algo
    std::string decryptPassword(const std::string& encrypted) {
    std::string result = encrypted;
    for (size_t i = 0; i < encrypted.length(); i++) {
        int c = (int)encrypted[i];
        int shifted = 32 + (((c - 32 - SHIFT_KEY) % 95 + 95) % 95);
        result[i] = (char)shifted;
    }
    return result;
}
int main(){
    crow::SimpleApp app;  //this will create our server obj.
    
    //http methods 

    CROW_ROUTE(app,"/db-test")([](){ // command is used to connect the db to the crow 
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER"))); // create a connection with database with dbname = pawalert ,
            pqxx::work txn(conn);

            pqxx::result r = txn.exec("SELECT area_name FROM area WHERE area_id = 1");
            txn.commit();

            std::string area_name = r[0][0].c_str();

            crow::json::wvalue response;
            response["connected"] = true;
            response["area_name"] = area_name;
            return crow::response(200, response);
        }
        catch (const std::exception& e) {
            crow::json::wvalue error;
            error["connected"] = false;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });


    CROW_ROUTE(app, "/")([](){                   //whenver some send get request "\" this function will gonna work.
        return "PawAlert server is running";
    });
    CROW_ROUTE(app,"/health")([](){              //this will send a proper json response return ,just like real api do .
        crow::json::wvalue response;
        response["service"] = "pawalert-backend";
        response["status"] = "ok";
        return response;
    });

    CROW_ROUTE(app, "/reports").methods(crow::HTTPMethod::POST)([](                //this is explicitly say it's post otherwise it will treat as get.
        const crow::request& req){
            auto body = crow::json::load(req.body);
            if(!body){
                return crow::response(400,"Invalid Json");
            }
            std::string animal_type = body["animal_type"].s();
            std::string condition = body["condition"].s();
            crow::json::wvalue response;
            response["report_id"] = 101;
            response["animal_type"] = animal_type;
            response["condition"] = condition;
            response["status"] = "pending";
            return crow::response(201, response);
                });
            CROW_ROUTE(app,"/cases/<int>/verify").methods(crow::HTTPMethod::PATCH)([](int case_id){
                crow::json::wvalue response;
                response["case_id"] = case_id;
                response["status"] = "verified";
                response["message"] = "case has been verified by moderator";
                return crow::response(200, response);
            });

    CROW_ROUTE(app,"/areas/<int>").methods(crow::HTTPMethod::PATCH)([](const crow::request& req, int area_id){ //patch request. 
        auto body = crow::json::load(req.body);
            if(!body) return crow::response(400, "INVALID JSON");
            std::string new_name = body["area_name"].s();

            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);

                txn.exec_params(
                    "UPDATE area SET area_name = $1 WHERE area_id = $2",
                    new_name, area_id
                );
                txn.commit();

                crow::json::wvalue response;
                response["area_id"] = area_id;
                response["area_name"] = new_name;
                return crow::response(200, response);
            }
            catch(const std::exception& e){
                crow::json::wvalue error;
                error["error"] = e.what();
                return crow::response(400, error);
            }
    });

    CROW_ROUTE(app,"/areas").methods(crow::HTTPMethod::POST)([](const crow::request& req){ //post request.
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400, "INVALID JSON");
        std::string area_name = body["area_name"].s();
            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);
                pqxx::result r = txn.exec_params(
                    "INSERT INTO area (area_name) VALUES ($1) RETURNING area_id",
                    area_name
                );
                txn.commit();
                crow::json::wvalue response;
                response["area_id"] = r[0][0].as<int>();
                response["area_name"] = area_name;
                return crow::response(201, response);
            }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
            }
        });

    CROW_ROUTE(app,"/areas")([](){  // get request.
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec("SELECT area_id, area_name FROM area");
            txn.commit();

            crow::json::wvalue response;
            int i = 0;
            for(auto row : r){
                response[i]["area_id"] = row["area_id"].as<int>();
                response[i]["area_name"] = row["area_name"].c_str();
                i++;
            }
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });

    CROW_ROUTE(app,"/resources").methods(crow::HTTPMethod::POST)([](const crow::request& req){  //post for resource.
        auto body = crow::json::load(req.body);
            if(!body) return crow::response(400, "INVALID JSON");
            std::string resource_type = body["resource_type"].s();
            std::string name = body["name"].s(); 
            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);
                pqxx::result r = txn.exec_params(
                    "INSERT INTO resource (resource_type,name) VALUES ($1 , $2) RETURNING resource_id",
                    resource_type,name
                );
                txn.commit();
                crow::json::wvalue response;
                response["resource_id"] = r[0][0].as<int>();
                response["resource_type"] = resource_type;
                response["name"] = name;
                return crow::response(201,response);
                }
            catch(const std::exception& e){
                crow::json::wvalue error;
                error["error"] = e.what();
                return crow::response(500 , error);
            }
    });

    CROW_ROUTE(app, "/resources")([](){  //get request for resource.
        try{
           pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec("SELECT resource_id,resource_type,name,available FROM resource");
            txn.commit(); 
            
            crow::json::wvalue response;
            int i=0;
            for(auto row : r){
                response[i]["resource_id"] = row["resource_id"].as<int>();
                response[i]["name"] = row["name"].c_str();
                response[i]["resource_type"] = row["resource_type"].c_str();
                response[i]["available"] = row["available"].c_str();
                i++;
            }
            return crow::response(200, response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });

    CROW_ROUTE(app,"/resources/<int>").methods(crow::HTTPMethod::PATCH)([](
        const crow::request& req,int resource_id){
            auto body = crow::json::load(req.body);
            if(!body) return crow::response(400, "INVALID JSON");
            bool available = body["available"].b();
            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);
        
                txn.exec_params(
                "UPDATE resource SET available = $1 WHERE resource_id = $2",
                available, resource_id
        );
        txn.commit();

        crow::json::wvalue response;
        response["resource_id"] = resource_id;
        response["available"] = available;
        return crow::response(200,response); 
            }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500,error);
        } 
        });
    
    CROW_ROUTE(app,"/resources/<int>").methods(crow::HTTPMethod::DELETE)([](int resource_id){
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            txn.exec_params(
                "DELETE FROM resource WHERE resource_id = $1",resource_id);
            txn.commit();
            
            crow::json::wvalue response;
            response["resource_id"] = resource_id;
            response["message"] = "Resource deleted Suceesfully";
            return crow::response(200, response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"]=e.what();
            return crow::response(500, error);
        }
    });

    CROW_ROUTE(app,"/users").methods(crow::HTTPMethod::POST)([](const crow::request& req){   //sign up post request.
        auto body = crow::json::load(req.body);
            if(!body) return crow::response(400,"INVALID JSON");
            std::string name=body["name"].s();
            std::string email = body["email"].s();
            std::string password = body["password"].s();
            std::string encrypt_password = encryptPassword(password);
            try{
                pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
                pqxx::work txn(conn);

                pqxx::result r = txn.exec_params(
                    "INSERT INTO app_user(name,email,password_hash) VALUES ($1,$2,$3) RETURNING user_id",
                    name,email,encrypt_password
                );
                txn.commit();
                crow::json::wvalue response;
                response["user_id"] = r[0][0].as<int>();
                response["name"] = name;
                response["email"] = email;
                return crow::response(201,response);
            }
            catch(const std::exception& e){
                crow::json::wvalue error;
                error["error"] = e.what();
                return crow::response(500 , error);
            }
    });

    CROW_ROUTE(app,"/login").methods(crow::HTTPMethod::POST)([](const crow::request& req){
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400, "INVALID JSON");
        std::string email = body["email"].s();
        std::string password = body["password"].s();
        std::string encrypt_attempt = encryptPassword(password);
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec_params(
            "SELECT user_id, name, password_hash FROM app_user WHERE email = $1",
            email
            );
            txn.commit();
            if(r.empty()){
                crow::json::wvalue error;
                error["error"] = "User Not Found";
                return crow::response(404, error);
            }
            
            std::string stored_encrypted = r[0]["password_hash"].c_str();
            if (encrypt_attempt == stored_encrypted) {
                crow::json::wvalue response;
                response["user_id"] = r[0]["user_id"].as<int>();
                response["name"] = r[0]["name"].c_str();
                response["message"] = "Login successful";
                return crow::response(200, response);
            } else {
                crow::json::wvalue error;
                error["error"] = "Incorrect password";
                return crow::response(401, error);
            }
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500,error);
        }
    });

    CROW_ROUTE(app,"/users")([](){
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec(
                "SELECT user_id,name,email,role FROM app_user"
            );
            txn.commit();

            crow::json::wvalue response;
            int i=0;
            for(auto row : r){
                response[i]["user_id"] = row["user_id"].as<int>();
                response[i]["name"] = row["name"].c_str();
                response[i]["email"] = row["email"].c_str();
                response[i]["role"] = row["role"].c_str();
                i++;
            }
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error); 
        }
    });

    
    CROW_ROUTE(app,"/users/<int>").methods(crow::HTTPMethod::PATCH)([](const crow::request& req,int user_id){
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400,"INVALID JSON");
        std::string name = body["name"].s();
        std::string email = body["email"].s(); 
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            txn.exec_params(
                "UPDATE app_user SET name =$1,email = $2 WHERE user_id = $3",
                name,email,user_id);
            txn.commit();

            crow::json::wvalue response;
            response["user_id"] = user_id;
            response["name"] = name;
            response["email"] = email;
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500,error);
        }
    });
    CROW_ROUTE(app,"/users/<int>/password").methods(crow::HTTPMethod::PATCH)([](const crow::request &req,int user_id){
        auto body = crow::json::load(req.body);
        if(!body) return crow::response(400,"INVALID JSON");
        std::string current_password = body["current_password"].s();
        std::string new_password = body["new_password"].s();
        try{
            pqxx::connection conn("dbname=pawalert user=" + std::string(getenv("USER")));
            pqxx::work txn(conn);

            pqxx::result r = txn.exec_params(
                "SELECT password_hash FROM app_user WHERE user_id = $1",
                user_id
            );

            if (r.empty()) {
                crow::json::wvalue error;
                error["error"] = "User not found";
                return crow::response(404, error);
            }
            std::string stored_encrypted = r[0]["password_hash"].c_str();
            std::string current_encrypted = encryptPassword(current_password);

            bool passwordMatches = (current_encrypted == stored_encrypted);

            if (!passwordMatches) {
                crow::json::wvalue error;
                error["error"] = "Current password is incorrect";
                return crow::response(401, error);
            }
            std::string new_encrypted = encryptPassword(new_password);
            txn.exec_params(
            "UPDATE app_user SET password_hash = $1 WHERE user_id = $2",
            new_encrypted, user_id
            );
            txn.commit();
            crow::json::wvalue response;
            response["user_id"]=user_id;
            response["message"]="Password Updated Successfully";
            return crow::response(200,response);
        }
        catch(const std::exception& e){
            crow::json::wvalue error;
            error["error"] = e.what();
            return crow::response(500, error);
        }
    });


    app.port(8080).multithreaded().run();        //serve this server on port 8080 and we can handle multiple request which is imp for os.
}