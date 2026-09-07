#ifndef AUTH_UTILS_H
#define AUTH_UTILS_H

#include <string>
#include <sstream>
#include <ctime>
#include "secret_config.h"

inline std::string encryptPassword(const std::string& password) {
    std::string result = password;
    for (size_t i = 0; i < password.length(); i++) {
        int c = (int)password[i];
        int shifted = 32 + ((c - 32 + SHIFT_KEY) % 95);
        result[i] = (char)shifted;
    }
    return result;
}

inline std::string decryptPassword(const std::string& encrypted) {
    std::string result = encrypted;
    for (size_t i = 0; i < encrypted.length(); i++) {
        int c = (int)encrypted[i];
        int shifted = 32 + (((c - 32 - SHIFT_KEY) % 95 + 95) % 95);
        result[i] = (char)shifted;
    }
    return result;
}

inline std::string generateToken(int user_id, const std::string& role) {
    std::stringstream ss;
    ss << user_id << ":" << role << ":" << time(nullptr);
    return encryptPassword(ss.str());
}

struct TokenData {
    int user_id;
    std::string role;
    bool valid;
};

inline TokenData verifyToken(const std::string& token) {
    TokenData data;
    data.valid = false;
    try {
        std::string decrypted = decryptPassword(token);
        size_t first_colon = decrypted.find(':');
        size_t second_colon = decrypted.find(':', first_colon + 1);
        if (first_colon == std::string::npos || second_colon == std::string::npos) {
            return data;
        }
        data.user_id = std::stoi(decrypted.substr(0, first_colon));
        data.role = decrypted.substr(first_colon + 1, second_colon - first_colon - 1);
        data.valid = true;
    } catch (...) {
        data.valid = false;
    }
    return data;
}

#endif
